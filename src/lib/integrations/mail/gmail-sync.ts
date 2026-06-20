import "server-only";

import { saveChannelMessageForUser } from "@/lib/messages/store";
import {
  getMailConnections,
  upsertMailConnection,
  type MailConnection,
} from "@/lib/integrations/mail/store";
import { createClient, requireUserId } from "@/lib/supabase/server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SYNC_MAX_MESSAGES = 50;

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string };
    parts?: GmailPart[];
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function headerValue(
  headers: GmailHeader[] | undefined,
  name: string
): string | undefined {
  return headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }

  if (part.parts?.length) {
    for (const child of part.parts) {
      if (child.mimeType === "text/plain") {
        const text = extractBody(child);
        if (text) return text;
      }
    }
    for (const child of part.parts) {
      const text = extractBody(child);
      if (text) return text;
    }
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return stripHtml(decodeBase64Url(part.body.data));
  }

  if (part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }

  return "";
}

function parseFromHeader(from: string | undefined): {
  senderLabel?: string;
  senderAddress?: string;
} {
  if (!from?.trim()) return {};
  const match = from.match(/^(?:"?([^"]*)"?\s)?<?([^>\s]+@[^>\s]+)>?$/);
  if (match) {
    const label = match[1]?.trim();
    const address = match[2]?.trim();
    return {
      senderLabel: label || address,
      senderAddress: address,
    };
  }
  return { senderLabel: from.trim(), senderAddress: from.trim() };
}

async function ensureGmailAccessToken(
  connection: MailConnection
): Promise<string> {
  if (!connection.connected || !connection.accessToken) {
    throw new Error("Gmail ist nicht verbunden.");
  }

  if (connection.expiresAt && connection.expiresAt > Date.now() + 60_000) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    return connection.accessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Gmail Token-Refresh fehlgeschlagen: ${await res.text()}`);
  }

  const tok = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  await upsertMailConnection("gmail", {
    accessToken: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  });

  return tok.access_token;
}

async function gmailFetch<T>(
  accessToken: string,
  path: string
): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gmail API Fehler (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as T;
}

async function providerMessageExists(
  userId: string,
  providerMessageId: string
): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("inbound_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("channel_type", "gmail")
    .eq("channel_ref", "gmail")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  return Boolean(data);
}

function mapGmailMessage(message: GmailMessage): {
  threadId: string;
  providerMessageId: string;
  subject?: string;
  body: string;
  preview?: string;
  receivedAt: string;
  senderLabel?: string;
  senderAddress?: string;
} {
  const headers = message.payload?.headers;
  const from = parseFromHeader(headerValue(headers, "From"));
  const body =
    extractBody(message.payload) ||
    message.snippet?.trim() ||
    "(Kein Nachrichtentext)";

  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date(
        headerValue(headers, "Date") ?? Date.now()
      ).toISOString();

  return {
    threadId: message.threadId,
    providerMessageId: message.id,
    subject: headerValue(headers, "Subject") ?? undefined,
    body,
    preview: message.snippet?.trim() || body.slice(0, 160),
    receivedAt,
    senderLabel: from.senderLabel,
    senderAddress: from.senderAddress,
  };
}

/** Pulls recent Gmail inbox messages into inbound_messages. */
export async function syncGmailInbox(): Promise<number> {
  const userId = await requireUserId();
  const connections = await getMailConnections();
  const gmail = connections.gmail;

  if (!gmail?.connected) {
    throw new Error("Gmail ist nicht verbunden.");
  }

  const accessToken = await ensureGmailAccessToken(gmail);
  const list = await gmailFetch<{ messages?: Array<{ id: string }> }>(
    accessToken,
    `/messages?maxResults=${SYNC_MAX_MESSAGES}&q=${encodeURIComponent("in:inbox")}`
  );

  const messageIds = list.messages?.map((entry) => entry.id) ?? [];
  let imported = 0;

  for (const messageId of messageIds) {
    if (await providerMessageExists(userId, messageId)) {
      continue;
    }

    const full = await gmailFetch<GmailMessage>(
      accessToken,
      `/messages/${messageId}?format=full`
    );
    const mapped = mapGmailMessage(full);

    try {
      await saveChannelMessageForUser(userId, {
        channelType: "gmail",
        channelRef: "gmail",
        threadId: mapped.threadId,
        direction: "inbound",
        body: mapped.body,
        subject: mapped.subject,
        preview: mapped.preview,
        senderLabel: mapped.senderLabel,
        senderAddress: mapped.senderAddress,
        providerMessageId: mapped.providerMessageId,
        receivedAt: mapped.receivedAt,
      });
      imported += 1;
    } catch (error) {
      console.warn("[gmail-sync] skip message", messageId, error);
    }
  }

  return imported;
}
