import type { InboundMessage, MessageThread } from "@/lib/messages/types";

/** True when the latest message in the thread is from the customer (needs a reply). */
export function threadAwaitingReply(
  messages: InboundMessage[],
  threadId: string
): boolean {
  const threadMessages = messages.filter((message) => message.threadId === threadId);
  if (threadMessages.length === 0) return false;

  const sorted = [...threadMessages].sort(
    (a, b) =>
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  );
  return sorted[sorted.length - 1]?.direction === "inbound";
}

export function filterThreadsAwaitingReply(
  threads: MessageThread[],
  messages: InboundMessage[]
): MessageThread[] {
  return threads.filter((thread) => threadAwaitingReply(messages, thread.id));
}

export function latestInboundAt(
  messages: InboundMessage[],
  threadId: string
): string | null {
  const inbound = messages
    .filter(
      (message) =>
        message.threadId === threadId && message.direction === "inbound"
    )
    .sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  return inbound[0]?.receivedAt ?? null;
}

export function inquiryNeedsReanalysis(
  analyzedAt: string | undefined,
  messages: InboundMessage[],
  threadId: string
): boolean {
  if (!analyzedAt) return true;
  const latestInbound = latestInboundAt(messages, threadId);
  if (!latestInbound) return false;
  return new Date(latestInbound).getTime() > new Date(analyzedAt).getTime();
}
