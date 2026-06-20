"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/brand/EmptyState";
import { landingBtnSecondary } from "@/components/landing/landing-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import type {
  InboundMessage,
  MessageChannel,
  MessageThread,
} from "@/lib/messages/types";
import { parseChannelId } from "@/lib/messages/types";
import { cn, formatDateTime } from "@/lib/utils";

interface MessageChannelPanelProps {
  channel: MessageChannel | null;
}

export function MessageChannelPanel({ channel }: MessageChannelPanelProps) {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<InboundMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!channel) {
      setThreads([]);
      return;
    }

    const parsed = parseChannelId(channel.id);
    if (!parsed) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        channelType: parsed.type,
        channelRef: parsed.ref,
      });
      const res = await fetch(`/api/messages?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setThreads((data.threads ?? []) as MessageThread[]);
      } else {
        setThreads([]);
      }
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  const loadThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    try {
      const params = new URLSearchParams({ threadId });
      const res = await fetch(`/api/messages?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setThreadMessages((data.messages ?? []) as InboundMessage[]);
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId }),
        });
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId ? { ...thread, unreadCount: 0 } : thread
          )
        );
      } else {
        setThreadMessages([]);
      }
    } catch {
      setThreadMessages([]);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedThreadId(null);
    setThreadMessages([]);
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadThread(selectedThreadId);
  }, [selectedThreadId, loadThread]);

  if (!channel) {
    return (
      <div className="landing-panel flex min-h-0 flex-1 items-center justify-center self-stretch border border-dashed border-[#E1E4EA] p-8">
        <p className="landing-body text-[#99A0AE]">
          Dienst auswählen, um Nachrichten und Chats anzuzeigen
        </p>
      </div>
    );
  }

  if (selectedThreadId) {
    const activeThread = threads.find((thread) => thread.id === selectedThreadId);

    return (
      <div
        className={cn(
          userPanelClass,
          "flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
        )}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[#E1E4EA] px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setSelectedThreadId(null);
              setThreadMessages([]);
            }}
            className={cn(landingBtnSecondary, "shrink-0 px-2.5")}
            aria-label="Zurück zur Liste"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className={userTitleClass}>{activeThread?.title ?? "Chat"}</p>
            {activeThread?.subtitle ? (
              <p className="truncate text-[12px] text-[#99A0AE]">
                {activeThread.subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {threadLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#99A0AE]" />
            </div>
          ) : threadMessages.length === 0 ? (
            <EmptyState
              illustration="calls"
              title="Keine Nachrichten in dieser Unterhaltung"
              subtle
            />
          ) : (
            <div className="space-y-3">
              {threadMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        userPanelClass,
        "flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      )}
    >
      <div className="shrink-0 border-b border-[#E1E4EA] px-5 py-4">
        <p className={userTitleClass}>{channel.label}</p>
        {channel.subtitle ? (
          <p className={`${userLabelClass} mt-1`}>{channel.subtitle}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-0 divide-y divide-[#E1E4EA]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-5 py-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : threads.length > 0 ? (
          <div className="divide-y divide-[#E1E4EA]">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedThreadId(thread.id)}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-medium text-[#0E121B]">
                      {thread.title}
                    </p>
                    {thread.unreadCount > 0 ? (
                      <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#335cff] px-1 text-[10px] font-medium text-white">
                        {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  {thread.subtitle ? (
                    <p className="mt-0.5 truncate text-[12px] text-[#99A0AE]">
                      {thread.subtitle}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-[13px] text-[#525866]">
                    {thread.preview}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-[#99A0AE]">
                  {formatDateTime(thread.lastMessageAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              illustration="calls"
              title="Noch keine Nachrichten"
              description="Sobald Ihr verbundener Dienst Nachrichten oder Chats liefert, erscheinen sie hier."
              subtle
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: InboundMessage }) {
  const inbound = message.direction === "inbound";

  return (
    <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg border px-3 py-2.5",
          inbound
            ? "border-[#E1E4EA] bg-[#FAFAFA] text-[#0E121B]"
            : "border-[#335cff]/20 bg-[#F8FAFF] text-[#0E121B]"
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[12px] font-medium">
            {message.senderLabel || message.senderAddress || "Unbekannt"}
          </span>
          <span className="text-[11px] text-[#99A0AE]">
            {formatDateTime(message.receivedAt)}
          </span>
        </div>
        {message.subject ? (
          <p className="mb-1 text-[12px] font-medium text-[#525866]">
            {message.subject}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
          {message.body}
        </p>
      </div>
    </div>
  );
}
