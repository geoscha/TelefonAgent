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
const MAX_INBOX_THREADS = 250;
const VERIFY_CONCURRENCY = 8;
/** Gmail search: inbox only — excludes spam, trash, archived. */
const INBOX_QUERY = "in:inbox -in:spam -in:trash";

export interface GmailSyncResult {
  imported: number;
  removed: number;
}

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

async function providerMessageIdsExist(
  userId: string,
  messageIds: string[]
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();

  const supabase = createClient();
  const { data } = await supabase
    .from("inbound_messages")
    .select("provider_message_id")
    .eq("user_id", userId)
    .eq("channel_type", "gmail")
    .eq("channel_ref", "gmail")
    .in("provider_message_id", messageIds);

  return new Set(
    (data ?? [])
      .map((row) => row.provider_message_id as string | null)
      .filter((id): id is string => Boolean(id))
  );
}

const FETCH_CONCURRENCY = 6;

async function listInboxThreadIds(accessToken: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;

  while (ids.size < MAX_INBOX_THREADS) {
    const params = new URLSearchParams({
      maxResults: String(Math.min(100, MAX_INBOX_THREADS - ids.size)),
      q: INBOX_QUERY,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await gmailFetch<{
      threads?: Array<{ id: string }>;
      nextPageToken?: string;
    }>(accessToken, `/threads?${params.toString()}`);

    for (const thread of page.threads ?? []) {
      ids.add(thread.id);
    }

    if (!page.nextPageToken || !page.threads?.length) break;
    pageToken = page.nextPageToken;
  }

  return ids;
}

async function listLocalGmailThreadIds(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select("thread_id")
    .eq("user_id", userId)
    .eq("channel_type", "gmail")
    .eq("channel_ref", "gmail");

  if (error) throw error;

  return Array.from(new Set((data ?? []).map((row) => row.thread_id as string)));
}

async function threadStillInInbox(
  accessToken: string,
  threadId: string
): Promise<boolean> {
  const result = await gmailFetch<{ messages?: Array<{ id: string }> }>(
    accessToken,
    `/messages?q=${encodeURIComponent(`thread:${threadId} ${INBOX_QUERY}`)}&maxResults=1`
  );
  return (result.messages?.length ?? 0) > 0;
}

async function purgeGmailThreadsNotInInbox(
  userId: string,
  accessToken: string,
  inboxThreadIds: Set<string>
): Promise<number> {
  const localThreadIds = await listLocalGmailThreadIds(userId);
  const candidates = localThreadIds.filter((id) => !inboxThreadIds.has(id));
  if (candidates.length === 0) return 0;

  const toRemove: string[] = [];
  for (let i = 0; i < candidates.length; i += VERIFY_CONCURRENCY) {
    const batch = candidates.slice(i, i + VERIFY_CONCURRENCY);
    const checks = await Promise.all(
      batch.map(async (threadId) => ({
        threadId,
        inInbox: await threadStillInInbox(accessToken, threadId),
      }))
    );
    for (const check of checks) {
      if (!check.inInbox) toRemove.push(check.threadId);
    }
  }

  if (toRemove.length === 0) return 0;

  const { deleteInquiriesForThreads } = await import(
    "@/lib/messages/inquiry-store"
  );
  await deleteInquiriesForThreads(toRemove);

  const supabase = createClient();
  const { error } = await supabase
    .from("inbound_messages")
    .delete()
    .eq("user_id", userId)
    .eq("channel_type", "gmail")
    .eq("channel_ref", "gmail")
    .in("thread_id", toRemove);

  if (error) throw error;
  return toRemove.length;
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

/** Pulls recent Gmail inbox messages into inbound_messages and purges deleted/spam threads. */
export async function syncGmailInbox(): Promise<GmailSyncResult> {
  const userId = await requireUserId();
  const connections = await getMailConnections();
  const gmail = connections.gmail;

  if (!gmail?.connected) {
    throw new Error("Gmail ist nicht verbunden.");
  }

  const accessToken = await ensureGmailAccessToken(gmail);
  const inboxThreadIds = await listInboxThreadIds(accessToken);

  const list = await gmailFetch<{ messages?: Array<{ id: string }> }>(
    accessToken,
    `/messages?maxResults=${SYNC_MAX_MESSAGES}&q=${encodeURIComponent(INBOX_QUERY)}`
  );

  const messageIds = list.messages?.map((entry) => entry.id) ?? [];
  const existingIds = await providerMessageIdsExist(userId, messageIds);
  const toImport = messageIds.filter((id) => !existingIds.has(id));
  let imported = 0;

  for (let i = 0; i < toImport.length; i += FETCH_CONCURRENCY) {
    const batch = toImport.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (messageId) => {
        try {
          const full = await gmailFetch<GmailMessage>(
            accessToken,
            `/messages/${messageId}?format=full`
          );
          const mapped = mapGmailMessage(full);
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
          return true;
        } catch (error) {
          console.warn("[gmail-sync] skip message", messageId, error);
          return false;
        }
      })
    );
    imported += results.filter(Boolean).length;
  }

  const removed = await purgeGmailThreadsNotInInbox(
    userId,
    accessToken,
    inboxThreadIds
  );

  return { imported, removed };
}
