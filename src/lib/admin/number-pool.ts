import "server-only";

import { configuredPoolNumbers, normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminPoolNumber {
  phoneNumber: string;
  elevenLabsPhoneNumberId: string;
  status: "frei" | "belegt";
  assignedUserId?: string;
  assignedUserName?: string;
  assignedUserEmail?: string;
  assignedAt?: string;
  inDatabase: boolean;
}

/** All pool numbers with assignment status (for admin dashboard). */
export async function listAdminPoolNumbers(): Promise<AdminPoolNumber[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("forwarding_number_pool")
    .select("*")
    .order("phone_number");

  const poolRows = rows ?? [];
  const userIds = poolRows
    .map((r) => r.assigned_user_id as string | null)
    .filter(Boolean) as string[];

  const profiles = new Map<string, { name: string; email: string }>();
  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);
    for (const p of profileRows ?? []) {
      profiles.set(p.id as string, {
        name: p.name as string,
        email: p.email as string,
      });
    }
  }

  const byPhone = new Map<string, AdminPoolNumber>();

  for (const row of poolRows) {
    const phone = normalizePhoneNumber(row.phone_number as string);
    const userId = row.assigned_user_id as string | null;
    const profile = userId ? profiles.get(userId) : undefined;
    byPhone.set(phone, {
      phoneNumber: phone,
      elevenLabsPhoneNumberId: row.elevenlabs_phone_number_id as string,
      status: userId ? "belegt" : "frei",
      assignedUserId: userId ?? undefined,
      assignedUserName: profile?.name,
      assignedUserEmail: profile?.email,
      assignedAt: (row.assigned_at as string | null) ?? undefined,
      inDatabase: true,
    });
  }

  for (const num of configuredPoolNumbers()) {
    if (!byPhone.has(num)) {
      byPhone.set(num, {
        phoneNumber: num,
        elevenLabsPhoneNumberId: "",
        status: "frei",
        inDatabase: false,
      });
    }
  }

  return Array.from(byPhone.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === "frei" ? -1 : 1;
    return a.phoneNumber.localeCompare(b.phoneNumber);
  });
}

export async function releaseNumberForUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("forwarding_number_pool")
    .update({ assigned_user_id: null, assigned_at: null })
    .eq("assigned_user_id", userId);
}

/** Normalised set of all numbers already in the pool (DB + env), any status. */
export async function getExistingPoolPhoneSet(): Promise<Set<string>> {
  const numbers = await listAdminPoolNumbers();
  return new Set(numbers.map((n) => normalizePhoneNumber(n.phoneNumber)));
}

export interface ParsedPoolNumbers {
  unique: string[];
  duplicateInInput: string[];
}

/** Parses and deduplicates phone input (normalised E.164). */
export function parseUniquePoolNumbers(raw: string[]): ParsedPoolNumbers {
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicateInInput: string[] = [];

  for (const entry of raw) {
    const phone = normalizePhoneNumber(entry.trim());
    if (!phone || phone === "+") continue;
    if (seen.has(phone)) {
      duplicateInInput.push(phone);
      continue;
    }
    seen.add(phone);
    unique.push(phone);
  }

  return { unique, duplicateInInput };
}
