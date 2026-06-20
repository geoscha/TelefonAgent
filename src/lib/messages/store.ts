import "server-only";

import {
  CHANNEL_TYPE_LABELS,
  channelId,
  type InboundMessage,
  type MessageChannel,
  type MessageChannelType,
  type MessageThread,
} from "@/lib/messages/types";
import { WHATSAPP_ACCOUNT_LABELS } from "@/lib/integrations/whatsapp/provider-meta";
import { getMailConnections } from "@/lib/integrations/mail/store";
import { listWhatsAppConnections } from "@/lib/integrations/whatsapp/store";
import { createClient, requireUserId } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToMessage(row: any): InboundMessage {
  return {
    id: row.id,
    channelType: row.channel_type,
    channelRef: row.channel_ref,
    threadId: row.thread_id,
    direction: row.direction,
    senderLabel: row.sender_label ?? undefined,
    senderAddress: row.sender_address ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body,
    preview: row.preview ?? undefined,
    receivedAt: row.received_at,
    read: Boolean(row.read),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listConnectedMessageChannels(): Promise<MessageChannel[]> {
  const [mailMap, whatsappConnections] = await Promise.all([
    getMailConnections(),
    listWhatsAppConnections(),
  ]);

  const channels: MessageChannel[] = [];

  for (const [provider, conn] of Object.entries(mailMap)) {
    if (!conn?.connected) continue;
    const type = provider as MessageChannelType;
    channels.push({
      id: channelId(type, provider),
      type,
      ref: provider,
      label: CHANNEL_TYPE_LABELS[type],
      subtitle: conn.accountLabel,
      unreadCount: 0,
    });
  }

  for (const entry of whatsappConnections) {
    if (!entry.connected) continue;
    channels.push({
      id: channelId("whatsapp", entry.id),
      type: "whatsapp",
      ref: entry.id,
      label: entry.whatsappNumber || entry.phoneNumber || "WhatsApp",
      subtitle: `${WHATSAPP_ACCOUNT_LABELS[entry.accountType]}${
        entry.phoneLabel ? ` · ${entry.phoneLabel}` : ""
      }`,
      unreadCount: 0,
    });
  }

  const userId = await requireUserId();
  const supabase = createClient();
  const { data: unreadRows } = await supabase
    .from("inbound_messages")
    .select("channel_type, channel_ref")
    .eq("user_id", userId)
    .eq("read", false);

  const unreadByChannel = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    const key = channelId(
      row.channel_type as MessageChannelType,
      row.channel_ref as string
    );
    unreadByChannel.set(key, (unreadByChannel.get(key) ?? 0) + 1);
  }

  return channels.map((channel) => ({
    ...channel,
    unreadCount: unreadByChannel.get(channel.id) ?? 0,
  }));
}

export async function listMessagesForChannel(input: {
  channelType: MessageChannelType;
  channelRef: string;
}): Promise<InboundMessage[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("channel_type", input.channelType)
    .eq("channel_ref", input.channelRef)
    .order("received_at", { ascending: false });

  if (error) {
    throw new Error("Nachrichten konnten nicht geladen werden.");
  }

  return (data ?? []).map(rowToMessage);
}

export function groupMessagesIntoThreads(
  messages: InboundMessage[],
  channelIdValue: string
): MessageThread[] {
  const byThread = new Map<string, InboundMessage[]>();

  for (const message of messages) {
    const bucket = byThread.get(message.threadId) ?? [];
    bucket.push(message);
    byThread.set(message.threadId, bucket);
  }

  const threads: MessageThread[] = [];

  for (const [threadId, threadMessages] of Array.from(byThread.entries())) {
    const sorted = [...threadMessages].sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
    const latest = sorted[0];
    const title =
      latest.subject?.trim() ||
      latest.senderLabel?.trim() ||
      latest.senderAddress?.trim() ||
      "Unterhaltung";
    const unreadCount = threadMessages.filter((entry) => !entry.read).length;

    threads.push({
      id: threadId,
      channelId: channelIdValue,
      title,
      subtitle: latest.senderAddress,
      preview:
        latest.preview?.trim() ||
        latest.body.trim().slice(0, 140) ||
        "Keine Vorschau",
      lastMessageAt: latest.receivedAt,
      unreadCount,
    });
  }

  return threads.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export async function listThreadsForChannel(input: {
  channelType: MessageChannelType;
  channelRef: string;
}): Promise<{ messages: InboundMessage[]; threads: MessageThread[] }> {
  const messages = await listMessagesForChannel(input);
  const threads = groupMessagesIntoThreads(
    messages,
    channelId(input.channelType, input.channelRef)
  );
  return { messages, threads };
}

export async function listThreadMessages(
  threadId: string
): Promise<InboundMessage[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("received_at", { ascending: true });

  if (error) {
    throw new Error("Unterhaltung konnte nicht geladen werden.");
  }

  return (data ?? []).map(rowToMessage);
}

export async function markThreadRead(threadId: string): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("inbound_messages")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .eq("read", false);
}

export async function saveChannelMessage(input: {
  channelType: MessageChannelType;
  channelRef: string;
  threadId: string;
  direction: "inbound" | "outbound";
  body: string;
  senderLabel?: string;
  senderAddress?: string;
  subject?: string;
  preview?: string;
}): Promise<InboundMessage> {
  const userId = await requireUserId();
  return saveChannelMessageForUser(userId, input);
}

export async function saveChannelMessageForUser(
  userId: string,
  input: {
    channelType: MessageChannelType;
    channelRef: string;
    threadId: string;
    direction: "inbound" | "outbound";
    body: string;
    senderLabel?: string;
    senderAddress?: string;
    subject?: string;
    preview?: string;
    providerMessageId?: string;
    receivedAt?: string;
  }
): Promise<InboundMessage> {
  const supabase = createClient();
  const preview =
    input.preview?.trim() || input.body.trim().slice(0, 160) || input.body;

  const { data, error } = await supabase
    .from("inbound_messages")
    .insert({
      user_id: userId,
      channel_type: input.channelType,
      channel_ref: input.channelRef,
      thread_id: input.threadId,
      direction: input.direction,
      sender_label: input.senderLabel ?? null,
      sender_address: input.senderAddress ?? null,
      subject: input.subject ?? null,
      body: input.body,
      preview,
      provider_message_id: input.providerMessageId ?? null,
      received_at: input.receivedAt ?? new Date().toISOString(),
      read: input.direction === "outbound",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Nachricht konnte nicht gespeichert werden.");
  }

  return rowToMessage(data);
}
