import "server-only";

import type {
  CraftsmanEmailDraft,
  CustomerDossier,
  MatchedCustomer,
  MessageInquiry,
  MessageInquiryCategory,
  MessageInquiryListItem,
  MessageInquiryStatus,
  MessageInquiryUrgency,
  MessageSuggestedAction,
} from "@/lib/messages/inquiry-types";
import type { InboundMessage, MessageChannelType } from "@/lib/messages/types";
import { groupMessagesIntoThreads } from "@/lib/messages/store";
import {
  filterThreadsAwaitingReply,
  threadAwaitingReply,
} from "@/lib/messages/thread-status";
import { createClient, requireUserId } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToInquiry(row: any): MessageInquiry {
  const context = (row.context ?? {}) as {
    contextSummary?: string;
    dossiers?: CustomerDossier[];
    matchedWorkflow?: MessageInquiry["matchedWorkflow"];
    workflowSlots?: Record<string, string>;
  };
  return {
    id: row.id,
    threadId: row.thread_id,
    channelType: row.channel_type,
    channelRef: row.channel_ref,
    agentId: row.agent_id ?? undefined,
    actionable: Boolean(row.actionable),
    category: (row.category ?? undefined) as MessageInquiryCategory | undefined,
    urgency: (row.urgency ?? undefined) as MessageInquiryUrgency | undefined,
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    summary: row.summary ?? undefined,
    contextSummary: context.contextSummary ?? undefined,
    draftReply: row.draft_reply ?? undefined,
    craftsmanDrafts: (row.craftsman_drafts ?? []) as CraftsmanEmailDraft[],
    suggestedActions: (row.suggested_actions ?? []) as MessageSuggestedAction[],
    matchedCustomers: (row.matched_customers ?? []) as MatchedCustomer[],
    dossiers: (context.dossiers ?? []) as CustomerDossier[],
    matchedWorkflow: context.matchedWorkflow ?? undefined,
    workflowSlots: context.workflowSlots ?? undefined,
    status: row.status,
    resolvedAt: row.resolved_at ?? undefined,
    analyzedAt: row.analyzed_at ?? undefined,
    createdAt: row.created_at,
  };
}

function inquiryToRow(
  userId: string,
  inquiry: Omit<MessageInquiry, "id" | "createdAt"> & { id?: string }
) {
  return {
    ...(inquiry.id ? { id: inquiry.id } : {}),
    user_id: userId,
    thread_id: inquiry.threadId,
    channel_type: inquiry.channelType,
    channel_ref: inquiry.channelRef,
    agent_id: inquiry.agentId ?? null,
    actionable: inquiry.actionable,
    category: inquiry.category ?? null,
    urgency: inquiry.urgency ?? null,
    confidence: inquiry.confidence ?? null,
    summary: inquiry.summary ?? null,
    draft_reply: inquiry.draftReply ?? null,
    craftsman_drafts: inquiry.craftsmanDrafts ?? [],
    suggested_actions: inquiry.suggestedActions,
    matched_customers: inquiry.matchedCustomers ?? [],
    context: {
      contextSummary: inquiry.contextSummary ?? null,
      dossiers: inquiry.dossiers ?? [],
      matchedWorkflow: inquiry.matchedWorkflow ?? null,
      workflowSlots: inquiry.workflowSlots ?? null,
    },
    status: inquiry.status,
    resolved_at: inquiry.resolvedAt ?? null,
    analyzed_at: inquiry.analyzedAt ?? null,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getInquiryByThreadId(
  threadId: string
): Promise<MessageInquiry | null> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("message_inquiries")
    .select("*")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToInquiry(data) : null;
}

export async function upsertInquiry(
  inquiry: Omit<MessageInquiry, "id" | "createdAt"> & { id?: string }
): Promise<MessageInquiry> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("message_inquiries")
    .upsert(inquiryToRow(userId, inquiry), { onConflict: "user_id,thread_id" })
    .select("*")
    .single();
  if (error) throw error;
  return rowToInquiry(data);
}

export async function updateInquiryDraft(
  threadId: string,
  patch: { draftReply?: string; craftsmanDrafts?: CraftsmanEmailDraft[] }
): Promise<MessageInquiry | null> {
  const supabase = createClient();
  const userId = await requireUserId();
  const update: Record<string, unknown> = {};
  if (patch.draftReply !== undefined) {
    update.draft_reply = patch.draftReply;
  }
  if (patch.craftsmanDrafts !== undefined) {
    update.craftsman_drafts = patch.craftsmanDrafts;
  }
  if (Object.keys(update).length === 0) return getInquiryByThreadId(threadId);

  const { data, error } = await supabase
    .from("message_inquiries")
    .update(update)
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToInquiry(data) : null;
}

export async function updateInquiryStatus(
  threadId: string,
  status: MessageInquiryStatus,
  patch?: Partial<
    Pick<MessageInquiry, "suggestedActions" | "resolvedAt" | "craftsmanDrafts">
  >
): Promise<MessageInquiry | null> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("message_inquiries")
    .update({
      status,
      resolved_at:
        status === "resolved" ? new Date().toISOString() : patch?.resolvedAt ?? null,
      ...(patch?.suggestedActions
        ? { suggested_actions: patch.suggestedActions }
        : {}),
      ...(patch?.craftsmanDrafts
        ? { craftsman_drafts: patch.craftsmanDrafts }
        : {}),
    })
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToInquiry(data) : null;
}

export async function listOpenThreadListItems(input: {
  channelType: MessageChannelType;
  channelRef: string;
  messages: InboundMessage[];
}): Promise<MessageInquiryListItem[]> {
  const supabase = createClient();
  const userId = await requireUserId();

  const threads = groupMessagesIntoThreads(
    input.messages,
    `${input.channelType}:${input.channelRef}`
  );
  const openThreads = filterThreadsAwaitingReply(threads, input.messages);
  if (openThreads.length === 0) return [];

  const threadIds = openThreads.map((thread) => thread.id);
  const { data, error } = await supabase
    .from("message_inquiries")
    .select("*")
    .eq("user_id", userId)
    .eq("channel_type", input.channelType)
    .eq("channel_ref", input.channelRef)
    .in("thread_id", threadIds);
  if (error) throw error;

  const inquiryByThread = new Map(
    (data ?? []).map((row) => [row.thread_id as string, rowToInquiry(row)])
  );

  const items: MessageInquiryListItem[] = openThreads.map((thread) => {
    const inquiry = inquiryByThread.get(thread.id);
    const hasSuggestion = Boolean(
      inquiry?.actionable &&
        inquiry.status === "open" &&
        (inquiry.suggestedActions.length > 0 ||
          inquiry.draftReply ||
          (inquiry.craftsmanDrafts?.length ?? 0) > 0)
    );

    return {
      id: inquiry?.id ?? `thread:${thread.id}`,
      threadId: thread.id,
      channelType: input.channelType,
      channelRef: input.channelRef,
      agentId: inquiry?.agentId,
      actionable: inquiry?.actionable ?? false,
      category: inquiry?.category,
      urgency: inquiry?.urgency,
      confidence: inquiry?.confidence,
      summary: inquiry?.summary,
      contextSummary: inquiry?.contextSummary,
      draftReply: inquiry?.draftReply,
      craftsmanDrafts: inquiry?.craftsmanDrafts ?? [],
      suggestedActions: inquiry?.suggestedActions ?? [],
      matchedCustomers: inquiry?.matchedCustomers ?? [],
      dossiers: inquiry?.dossiers ?? [],
      matchedWorkflow: inquiry?.matchedWorkflow,
      workflowSlots: inquiry?.workflowSlots,
      status: inquiry?.status ?? "open",
      resolvedAt: inquiry?.resolvedAt,
      analyzedAt: inquiry?.analyzedAt,
      createdAt: inquiry?.createdAt ?? thread.lastMessageAt,
      title: thread.title,
      subtitle: thread.subtitle,
      preview: inquiry?.summary || thread.preview,
      lastMessageAt: thread.lastMessageAt,
      unreadCount: thread.unreadCount,
      awaitingReply: true,
      hasSuggestion,
    };
  });

  return items.sort(
    (a, b) =>
      Number(b.hasSuggestion) - Number(a.hasSuggestion) ||
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

/** @deprecated Use listOpenThreadListItems — kept for callers that only need actionable rows. */
export async function listActionableInquiries(input: {
  channelType: MessageChannelType;
  channelRef: string;
  messages: InboundMessage[];
}): Promise<MessageInquiryListItem[]> {
  const items = await listOpenThreadListItems(input);
  return items.filter((item) => item.hasSuggestion);
}

export async function countOpenThreadsAwaitingReplyForChannel(input: {
  channelType: MessageChannelType;
  channelRef: string;
  messages?: InboundMessage[];
}): Promise<number> {
  if (input.messages) {
    const threads = groupMessagesIntoThreads(
      input.messages,
      `${input.channelType}:${input.channelRef}`
    );
    return filterThreadsAwaitingReply(threads, input.messages).length;
  }

  const { listMessagesForChannel } = await import("@/lib/messages/store");
  const messages = await listMessagesForChannel({
    channelType: input.channelType,
    channelRef: input.channelRef,
  });
  const threads = groupMessagesIntoThreads(
    messages,
    `${input.channelType}:${input.channelRef}`
  );
  return filterThreadsAwaitingReply(threads, messages).length;
}

export async function countOpenActionableInquiriesForChannel(input: {
  channelType: MessageChannelType;
  channelRef: string;
}): Promise<number> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { count, error } = await supabase
    .from("message_inquiries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel_type", input.channelType)
    .eq("channel_ref", input.channelRef)
    .eq("actionable", true)
    .eq("status", "open");
  if (error) throw error;
  return count ?? 0;
}

export async function resolveInquiryIfReplied(
  threadId: string,
  messages: InboundMessage[]
): Promise<void> {
  if (threadAwaitingReply(messages, threadId)) return;

  const existing = await getInquiryByThreadId(threadId);
  if (!existing || existing.status === "resolved") return;

  await updateInquiryStatus(threadId, "resolved", {
    resolvedAt: new Date().toISOString(),
  });
}

export async function listThreadIdsWithoutInquiry(
  threadIds: string[]
): Promise<string[]> {
  if (threadIds.length === 0) return [];
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("message_inquiries")
    .select("thread_id")
    .eq("user_id", userId)
    .in("thread_id", threadIds);
  if (error) throw error;
  const existing = new Set((data ?? []).map((row) => row.thread_id as string));
  return threadIds.filter((id) => !existing.has(id));
}

export async function deleteInquiriesForThreads(threadIds: string[]): Promise<void> {
  if (threadIds.length === 0) return;
  const supabase = createClient();
  const userId = await requireUserId();
  const { error } = await supabase
    .from("message_inquiries")
    .delete()
    .eq("user_id", userId)
    .in("thread_id", threadIds);
  if (error) throw error;
}
