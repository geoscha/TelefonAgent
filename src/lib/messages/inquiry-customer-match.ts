import "server-only";

import {
  findCustomerByPhoneForUser,
  findCustomersByNameForUser,
} from "@/lib/customers/store";
import type { CustomerDataProviderId, CustomerRecord } from "@/lib/customers/types";
import { normalizePhoneNumber } from "@/lib/phone/normalize";
import type { MatchedCustomer } from "@/lib/messages/inquiry-types";
import type { InboundMessage } from "@/lib/messages/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server";

const NAME_STOPWORDS = new Set([
  "guten",
  "tag",
  "grüezi",
  "gruezi",
  "freundliche",
  "grüsse",
  "gruesse",
  "mit",
  "freundlichen",
  "hallo",
  "danke",
  "bitte",
  "verwaltung",
  "liegenschaft",
  "wohnung",
  "zimmer",
]);

function threadFullText(messages: InboundMessage[]): string {
  return messages
    .map((message) => {
      const subject = message.subject ? `${message.subject} ` : "";
      return `${subject}${message.body}`;
    })
    .join("\n");
}

function extractNameCandidates(messages: InboundMessage[]): string[] {
  const candidates = new Set<string>();
  const text = threadFullText(messages);

  for (const message of messages) {
    if (message.direction !== "inbound") continue;
    if (message.senderLabel?.trim()) {
      for (const part of message.senderLabel.trim().split(/\s+/)) {
        if (part.length >= 3) candidates.add(part);
      }
    }
    const emailLocal = message.senderAddress?.split("@")[0];
    if (emailLocal) {
      for (const part of emailLocal.replace(/[._+-]/g, " ").split(/\s+/)) {
        if (part.length >= 3 && !/^\d+$/.test(part)) candidates.add(part);
      }
    }
  }

  const signedPatterns = [
    /\b(?:mit freundlichen grüssen|freundliche grüsse),?\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)/gi,
    /\b(?:ich bin|mein name ist|hier spricht|hier ist)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)/gi,
  ];
  for (const pattern of signedPatterns) {
    for (const match of Array.from(text.matchAll(pattern))) {
      const name = match[1]?.trim();
      if (name) {
        for (const part of name.split(/\s+/)) {
          if (part.length >= 3) candidates.add(part);
        }
      }
    }
  }

  for (const match of Array.from(
    text.matchAll(/\b([A-ZÄÖÜ][a-zäöüß]{2,}(?:\s+[A-ZÄÖÜ][a-zäöüß]{2,})?)\b/g)
  )) {
    const token = match[1]?.trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    if (NAME_STOPWORDS.has(lower)) continue;
    for (const part of token.split(/\s+/)) {
      if (part.length >= 3 && !NAME_STOPWORDS.has(part.toLowerCase())) {
        candidates.add(part);
      }
    }
  }

  return Array.from(candidates).slice(0, 12);
}

function extractPhones(messages: InboundMessage[]): string[] {
  const phones = new Set<string>();
  for (const message of messages) {
    for (const match of Array.from(
      message.body.matchAll(/(?:\+41|0)\s*(?:\d[\s.-]?){8,12}\d/g)
    )) {
      const normalized = normalizePhoneNumber(match[0]);
      if (normalized) phones.add(normalized);
    }
  }
  return Array.from(phones);
}

function extractAddressNeedles(messages: InboundMessage[]): string[] {
  const needles = new Set<string>();
  const text = threadFullText(messages);

  for (const match of Array.from(
    text.matchAll(
      /\b([A-ZÄÖÜ][a-zäöüß]+(?:strasse|straße|weg|gasse|platz|allee)\s+\d+[a-z]?)/gi
    )
  )) {
    needles.add(match[1].trim());
  }

  for (const match of Array.from(text.matchAll(/\b(\d{4}\s+[A-ZÄÖÜ][a-zäöüß]+)\b/g))) {
    needles.add(match[1].trim());
  }

  return Array.from(needles).slice(0, 6);
}

async function findCustomersByAddressNeedle(
  userId: string,
  needle: string,
  limit = 3
): Promise<CustomerRecord[]> {
  const escaped = needle.replace(/[%_,]/g, " ").trim();
  if (escaped.length < 4) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .or(`address.ilike.%${escaped}%,property_label.ilike.%${escaped}%`)
    .order("name", { ascending: true })
    .limit(limit);

  return (data ?? []).map(
    (row) =>
      ({
        id: `${row.provider}:${row.external_id}`,
        provider: row.provider as CustomerDataProviderId,
        externalId: row.external_id ?? undefined,
        name: row.name,
        phone: row.phone ?? undefined,
        email: row.email ?? undefined,
        address: row.address ?? undefined,
        propertyLabel: row.property_label ?? undefined,
        rentalStart: row.rental_start ?? undefined,
        rentalEnd: row.rental_end ?? undefined,
        rentalInfo: row.rental_info ?? undefined,
      }) satisfies CustomerRecord
  );
}

function toMatchedCustomer(
  record: CustomerRecord,
  matchReason: string
): MatchedCustomer {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    email: record.email,
    address: record.address,
    propertyLabel: record.propertyLabel,
    rentalInfo: record.rentalInfo,
    matchReason,
  };
}

/**
 * Cross-reference the full message thread against the customer mirror.
 * Matches by sender, phone numbers, names (incl. last names) and addresses in the text.
 */
export async function matchCustomersFromThread(
  messages: InboundMessage[]
): Promise<MatchedCustomer[]> {
  const userId = await requireUserId();
  const byId = new Map<string, MatchedCustomer>();

  function add(record: CustomerRecord | null | undefined, reason: string) {
    if (!record) return;
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, toMatchedCustomer(record, reason));
      return;
    }
    if (!existing.matchReason.includes(reason)) {
      byId.set(record.id, {
        ...existing,
        matchReason: `${existing.matchReason}, ${reason}`,
      });
    }
  }

  for (const message of messages) {
    if (message.direction !== "inbound") continue;
    if (message.senderAddress?.includes("@")) {
      const email = message.senderAddress.trim().toLowerCase();
      const admin = createAdminClient();
      const { data } = await admin
        .from("customer_records")
        .select("*")
        .eq("user_id", userId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (data) {
        add(
          {
            id: `${data.provider}:${data.external_id}`,
            provider: data.provider as CustomerDataProviderId,
            name: data.name,
            phone: data.phone ?? undefined,
            email: data.email ?? undefined,
            address: data.address ?? undefined,
            propertyLabel: data.property_label ?? undefined,
            rentalInfo: data.rental_info ?? undefined,
          },
          "E-Mail-Adresse"
        );
      }
    }
  }

  for (const phone of extractPhones(messages)) {
    add(await findCustomerByPhoneForUser(userId, phone), "Telefonnummer im Text");
  }

  for (const sender of messages) {
    if (sender.direction !== "inbound" || !sender.senderAddress) continue;
    const normalized = normalizePhoneNumber(sender.senderAddress);
    if (normalized) {
      add(await findCustomerByPhoneForUser(userId, normalized), "Absender-Nummer");
    }
  }

  for (const name of extractNameCandidates(messages)) {
    const matches = await findCustomersByNameForUser(userId, name, 3);
    for (const record of matches) {
      add(record, `Name «${name}»`);
    }
  }

  for (const needle of extractAddressNeedles(messages)) {
    const matches = await findCustomersByAddressNeedle(userId, needle, 2);
    for (const record of matches) {
      add(record, `Adresse «${needle}»`);
    }
  }

  return Array.from(byId.values()).slice(0, 5);
}

export function formatMatchedCustomersForPrompt(
  matches: MatchedCustomer[]
): string {
  if (matches.length === 0) return "";
  return `\n\nTreffer in der Kundendatenbank:\n${matches
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.name}${entry.address ? ` · ${entry.address}` : ""}${entry.phone ? ` · ${entry.phone}` : ""}${entry.propertyLabel ? ` · ${entry.propertyLabel}` : ""} (Grund: ${entry.matchReason})`
    )
    .join("\n")}`;
}
