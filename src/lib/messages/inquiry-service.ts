import "server-only";

import { analyzeMessageInquiry, isLikelyActionableThread } from "@/lib/messages/inquiry-analysis";
import {
  deleteInquiriesForThreads,
  getInquiryByThreadId,
  listThreadIdsWithoutInquiry,
  resolveInquiryIfReplied,
  updateInquiryStatus,
  upsertInquiry,
} from "@/lib/messages/inquiry-store";
import type { MessageInquiry } from "@/lib/messages/inquiry-types";
import type { InboundMessage, MessageChannelType, MessageThread } from "@/lib/messages/types";
import {
  filterThreadsAwaitingReply,
  inquiryNeedsReanalysis,
  threadAwaitingReply,
} from "@/lib/messages/thread-status";
import type { StoredAgent } from "@/lib/onboarding-types";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

const ANALYZE_BATCH = 15;
/** Tool-loop analysis is heavier, so cap parallel LLM runs to avoid rate limits. */
const ANALYZE_CONCURRENCY = 4;

export function resolveDefaultAgent(
  agents: StoredAgent[] | undefined,
  preferredId?: string
): StoredAgent | null {
  if (!agents?.length) return null;
  if (preferredId) {
    const match = agents.find((agent) => agent.id === preferredId);
    if (match) return match;
  }
  return agents[0] ?? null;
}

export async function ensureInquiryAnalyzed(input: {
  thread: MessageThread;
  messages: InboundMessage[];
  agent: StoredAgent;
  force?: boolean;
}): Promise<MessageInquiry | null> {
  const existing = await getInquiryByThreadId(input.thread.id);
  const threadMessages = input.messages.filter(
    (message) => message.threadId === input.thread.id
  );
  if (threadMessages.length === 0) return existing;

  const awaiting = threadAwaitingReply(input.messages, input.thread.id);
  if (!awaiting) {
    await resolveInquiryIfReplied(input.thread.id, input.messages);
    return getInquiryByThreadId(input.thread.id);
  }

  const hasInbound = threadMessages.some((message) => message.direction === "inbound");
  if (!hasInbound) return existing;

  const likelyRelevant = isLikelyActionableThread(threadMessages);
  if (!likelyRelevant) {
    return existing;
  }

  const needsAnalysis =
    input.force ||
    !existing?.analyzedAt ||
    existing.status === "resolved" ||
    inquiryNeedsReanalysis(existing.analyzedAt, input.messages, input.thread.id);

  if (!needsAnalysis) {
    if (existing && existing.actionable && existing.status !== "open") {
      return updateInquiryStatus(input.thread.id, "open");
    }
    return existing;
  }

  const analysis = await analyzeMessageInquiry({
    agent: input.agent,
    messages: threadMessages,
    channelType: threadMessages[0].channelType,
    channelRef: threadMessages[0].channelRef,
    threadId: input.thread.id,
    userId: await requireUserId(),
  });

  if (!analysis.actionable) {
    if (existing?.actionable) {
      return updateInquiryStatus(input.thread.id, "dismissed");
    }
    return existing;
  }

  return upsertInquiry({
    ...(existing ? { id: existing.id } : {}),
    threadId: input.thread.id,
    channelType: threadMessages[0].channelType,
    channelRef: threadMessages[0].channelRef,
    agentId: input.agent.id,
    actionable: true,
    category: analysis.category,
    urgency: analysis.urgency,
    confidence: analysis.confidence,
    summary: analysis.summary,
    contextSummary: analysis.contextSummary,
    draftReply: analysis.draftReply,
    craftsmanDrafts: analysis.craftsmanDrafts ?? [],
    suggestedActions: analysis.suggestedActions,
    matchedCustomers: analysis.matchedCustomers,
    dossiers: analysis.dossiers,
    matchedWorkflow: analysis.matchedWorkflow,
    workflowSlots: analysis.workflowSlots,
    workflowRouterConfidence: analysis.workflowRouterConfidence,
    status: "open",
    analyzedAt: new Date().toISOString(),
  });
}

function threadsNeedingAnalysis(input: {
  threads: MessageThread[];
  messages: InboundMessage[];
  force?: boolean;
}): MessageThread[] {
  const openThreads = filterThreadsAwaitingReply(input.threads, input.messages);

  return openThreads.filter((thread) => {
    const threadMessages = input.messages.filter(
      (message) => message.threadId === thread.id
    );
    if (!isLikelyActionableThread(threadMessages)) return false;
    if (input.force) return true;
    return true;
  });
}

export async function analyzePendingThreads(input: {
  threads: MessageThread[];
  messages: InboundMessage[];
  force?: boolean;
}): Promise<void> {
  const settings = await getSettings();
  const agent = resolveDefaultAgent(settings.agents, settings.agentId);
  if (!agent) return;

  await Promise.all(
    filterThreadsAwaitingReply(input.threads, input.messages).map((thread) =>
      resolveInquiryIfReplied(thread.id, input.messages)
    )
  );

  let toAnalyze: MessageThread[];
  if (input.force) {
    toAnalyze = threadsNeedingAnalysis(input);
  } else {
    const candidates = threadsNeedingAnalysis(input);
    const missing = await listThreadIdsWithoutInquiry(
      candidates.map((thread) => thread.id)
    );

    toAnalyze = candidates.filter((thread) => {
      if (missing.includes(thread.id)) return true;
      return false;
    });

    for (const thread of candidates) {
      if (toAnalyze.length >= ANALYZE_BATCH) break;
      if (toAnalyze.some((entry) => entry.id === thread.id)) continue;

      const existing = await getInquiryByThreadId(thread.id);
      if (
        existing &&
        inquiryNeedsReanalysis(existing.analyzedAt, input.messages, thread.id)
      ) {
        toAnalyze.push(thread);
      }
    }

    toAnalyze = toAnalyze.slice(0, ANALYZE_BATCH);
  }

  for (let i = 0; i < toAnalyze.length; i += ANALYZE_CONCURRENCY) {
    const slice = toAnalyze.slice(i, i + ANALYZE_CONCURRENCY);
    await Promise.all(
      slice.map((thread) =>
        ensureInquiryAnalyzed({
          thread,
          messages: input.messages,
          agent,
          force: input.force,
        }).catch((error) => {
          console.error("[message-inquiry] analyze failed", {
            threadId: thread.id,
            error: error instanceof Error ? error.message : String(error),
          });
        })
      )
    );
  }
}

export async function reanalyzeChannelInquiries(input: {
  channelType: MessageChannelType;
  channelRef: string;
  threads: MessageThread[];
  messages: InboundMessage[];
}): Promise<void> {
  const relevantThreads = threadsNeedingAnalysis({
    threads: input.threads,
    messages: input.messages,
    force: true,
  });
  const threadIds = relevantThreads.map((thread) => thread.id);
  await deleteInquiriesForThreads(threadIds);
  await analyzePendingThreads({
    threads: input.threads,
    messages: input.messages,
    force: true,
  });
}
