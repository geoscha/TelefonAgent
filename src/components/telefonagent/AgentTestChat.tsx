"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { landingBtnSecondary } from "@/components/landing/landing-buttons";
import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "agent";

type SessionState = "idle" | "connecting" | "connected" | "error";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

interface TextConversationSession {
  sendUserMessage: (text: string) => void;
  sendUserActivity: () => void;
  endSession: () => Promise<void>;
}

interface AgentTestChatProps {
  agentId: string;
  agentName: string;
  draft: AgentChatDraft;
  disabled?: boolean;
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toolResultIndicatesGoalComplete(
  toolName: string,
  rawResult: string | undefined
): boolean {
  if (!rawResult?.trim()) return false;
  try {
    const parsed = JSON.parse(rawResult) as {
      booked?: boolean;
      cancelled?: boolean;
    };
    if (toolName === "book_appointment") return parsed.booked === true;
    if (toolName === "cancel_appointment") return parsed.cancelled === true;
  } catch {
    return false;
  }
  return false;
}

export function AgentTestChat({
  agentId,
  agentName,
  draft,
  disabled = false,
}: AgentTestChatProps) {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [agentTyping, setAgentTyping] = useState(false);
  const [calendarChecking, setCalendarChecking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const conversationRef = useRef<TextConversationSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamIdRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const mountedRef = useRef(true);
  const pendingCloseRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStreamingMessage = messages.some((m) => m.streaming);

  const chatOpen = sessionState !== "idle";
  const displayName = agentName.trim() || "Agent";

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      const session = conversationRef.current;
      conversationRef.current = null;
      if (session) {
        void session.endSession().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, agentTyping, calendarChecking]);

  const teardownSession = useCallback(async () => {
    const session = conversationRef.current;
    conversationRef.current = null;
    streamIdRef.current = null;
    setAgentTyping(false);
    setCalendarChecking(false);
    if (session) {
      try {
        await session.endSession();
      } catch {
        // ignore teardown errors
      }
    }
    void fetch("/api/elevenlabs/agent/chat/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    }).catch(() => {});
  }, [agentId]);

  const closeChat = useCallback(async () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    pendingCloseRef.current = false;
    await teardownSession();
    if (!mountedRef.current) return;
    setSessionState("idle");
    setConnectionError(null);
    setMessages([]);
    setInput("");
  }, [teardownSession]);

  const scheduleCloseAfterAgentReply = useCallback(() => {
    if (!pendingCloseRef.current || closeTimerRef.current) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      void closeChat();
    }, 2000);
  }, [closeChat]);

  const applyAgentMessage = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages((prev) => {
      const streamId = streamIdRef.current;
      if (streamId) {
        streamIdRef.current = null;
        return prev.map((m) =>
          m.id === streamId
            ? { ...m, content: trimmed, streaming: false }
            : m
        );
      }

      const last = prev[prev.length - 1];
      if (last?.role === "agent" && last.content === trimmed) {
        return prev;
      }

      return [...prev, { id: nextId(), role: "agent", content: trimmed }];
    });
    setAgentTyping(false);
    setCalendarChecking(false);
    scheduleCloseAfterAgentReply();
  }, [scheduleCloseAfterAgentReply]);

  const connectChat = useCallback(async () => {
    if (disabled || sessionState === "connecting") return;

    await teardownSession();
    setSessionState("connecting");
    setConnectionError(null);
    setMessages([]);
    setInput("");

    try {
      const res = await fetch("/api/elevenlabs/agent/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          draft: draftRef.current,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        signedUrl?: string;
        overrides?: Record<string, unknown>;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.signedUrl) {
        const message = data.error ?? "Bitte später erneut versuchen.";
        setSessionState("error");
        setConnectionError(message);
        toast.error("Chat konnte nicht gestartet werden.", {
          description: message,
        });
        return;
      }

      const { Conversation } = await import("@elevenlabs/client");

      const conversation = await Conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: "websocket",
        textOnly: true,
        overrides: data.overrides as Parameters<
          typeof Conversation.startSession
        >[0]["overrides"],
        onDisconnect: (details) => {
          if (!mountedRef.current) return;
          conversationRef.current = null;
          streamIdRef.current = null;
          setAgentTyping(false);
          setCalendarChecking(false);
          setSessionState("error");
          const message =
            details.reason === "error"
              ? details.message
              : "Verbindung getrennt.";
          setConnectionError(message);
        },
        onError: (message) => {
          if (!mountedRef.current) return;
          setSessionState("error");
          setConnectionError(message);
        },
        onAgentTyping: () => {
          if (!mountedRef.current) return;
          setAgentTyping(true);
        },
        onAgentToolRequest: () => {
          if (!mountedRef.current) return;
          setCalendarChecking(true);
          setAgentTyping(true);
        },
        onAgentToolResponse: (props) => {
          if (!mountedRef.current) return;
          setCalendarChecking(false);
          setAgentTyping(true);
          const rawResult =
            "full_tool_result" in props &&
            typeof props.full_tool_result === "string"
              ? props.full_tool_result
              : undefined;
          if (
            toolResultIndicatesGoalComplete(props.tool_name, rawResult)
          ) {
            pendingCloseRef.current = true;
          }
        },
        onAgentChatResponsePart: (part) => {
          if (!mountedRef.current) return;
          const type = part.type;
          if (type === "start") {
            streamIdRef.current = null;
            setAgentTyping(true);
            return;
          }
          if (type === "delta" && part.text) {
            setMessages((prev) => {
              const streamId = streamIdRef.current;
              if (streamId) {
                const current = prev.find((m) => m.id === streamId);
                const nextText = `${current?.content ?? ""}${part.text}`;
                return prev.map((m) =>
                  m.id === streamId
                    ? { ...m, content: nextText, streaming: true }
                    : m
                );
              }
              const id = nextId();
              streamIdRef.current = id;
              return [
                ...prev,
                { id, role: "agent", content: part.text, streaming: true },
              ];
            });
            return;
          }
          if (type === "stop") {
            streamIdRef.current = null;
            setMessages((prev) =>
              prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
            );
            setAgentTyping(false);
            scheduleCloseAfterAgentReply();
          }
        },
        onMessage: ({ role, message }) => {
          if (!mountedRef.current || role !== "agent") return;
          applyAgentMessage(message);
        },
      });

      if (!mountedRef.current) {
        await conversation.endSession();
        return;
      }

      conversationRef.current = conversation;
      setSessionState("connected");
      setAgentTyping(true);
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler.";
      setSessionState("error");
      setConnectionError(message);
      toast.error("Chat konnte nicht gestartet werden.", {
        description: message,
      });
    }
  }, [
    agentId,
    applyAgentMessage,
    disabled,
    scheduleCloseAfterAgentReply,
    sessionState,
    teardownSession,
  ]);

  const openChat = useCallback(() => {
    if (chatOpen) return;
    void connectChat();
  }, [chatOpen, connectChat]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    const session = conversationRef.current;
    if (!text || !session || sessionState !== "connected") return;

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: text },
    ]);
    setInput("");
    streamIdRef.current = null;
    setAgentTyping(true);
    session.sendUserMessage(text);
  }, [input, sessionState]);

  const canSend = sessionState === "connected" && input.trim().length > 0;

  return (
    <div className="mt-3">
      {!chatOpen ? (
        <button
          type="button"
          onClick={openChat}
          disabled={disabled}
          className={cn(
            landingBtnSecondary,
            "w-full justify-center"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5 stroke-[1.75]" />
          Chatte mit {displayName}
        </button>
      ) : (
        <div className="space-y-2">
          {connectionError && (
            <p className="text-[11px] text-[#b91c1c]">{connectionError}</p>
          )}

          <div
            ref={scrollRef}
            className="flex max-h-[220px] min-h-[120px] flex-col gap-2 overflow-y-auto rounded-md border border-[#E1E4EA] bg-white p-2.5"
          >
            {messages.length === 0 && sessionState === "connecting" && (
              <p className="text-center text-[11px] text-[#99A0AE]">…</p>
            )}
            {messages.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "flex",
                  entry.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                    entry.role === "user"
                      ? "bg-[#335cff] text-white"
                      : "bg-[#F3F5F8] text-[#0E121B]"
                  )}
                >
                  {entry.content}
                  {entry.streaming && (
                    <span className="ml-0.5 inline-block h-[12px] w-[2px] animate-pulse bg-[#99A0AE] align-middle" />
                  )}
                </div>
              </div>
            ))}
            {calendarChecking && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[#EEF2FF] px-3 py-2 text-[11px] text-[#335cff]">
                  Kalender wird geprüft…
                </div>
              </div>
            )}
            {agentTyping && !hasStreamingMessage && !calendarChecking && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[#F3F5F8] px-3 py-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#99A0AE]"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              autoFocus
              onChange={(e) => {
                setInput(e.target.value);
                conversationRef.current?.sendUserActivity();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sessionState !== "connected"}
              placeholder="Nachricht…"
              className="min-w-0 flex-1 rounded-md border border-[#E1E4EA] bg-white px-3 py-2 text-[13px] text-[#0E121B] placeholder:text-[#99A0AE] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-[#99A0AE]"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!canSend}
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#335cff] px-3 py-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Senden"
            >
              {sessionState === "connecting" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 stroke-[2]" />
              )}
            </button>
          </div>

          <div className="flex justify-end gap-3">
            {sessionState === "error" && (
              <button
                type="button"
                onClick={() => void connectChat()}
                className="text-[11px] text-[#335cff] hover:underline"
              >
                Erneut
              </button>
            )}
            <button
              type="button"
              onClick={() => void closeChat()}
              className="text-[11px] text-[#99A0AE] hover:text-[#525866] hover:underline"
            >
              Schliessen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
