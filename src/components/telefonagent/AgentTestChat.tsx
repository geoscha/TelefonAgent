"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, Loader2, MessageSquare, Send, X } from "lucide-react";
import { toast } from "sonner";

import { landingBtnSecondary } from "@/components/landing/landing-buttons";
import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import { greetingForAssistantName } from "@/lib/elevenlabs/assistant-names";
import type { BookedAppointmentInfo } from "@/lib/text-assistant/types";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "agent";

type SessionState = "idle" | "connecting" | "connected" | "error";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

interface TextChatTurn {
  role: "user" | "assistant";
  content: string;
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

function dayIsoFromStartIso(startIso: string): string {
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAppointmentWhen(startIso: string): string {
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("de-CH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentTestChat({
  agentId,
  agentName,
  draft,
  disabled = false,
}: AgentTestChatProps) {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [agentTyping, setAgentTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [bookedAppointment, setBookedAppointment] =
    useState<BookedAppointmentInfo | null>(null);

  const historyRef = useRef<TextChatTurn[]>([]);
  const draftRef = useRef(draft);
  const mountedRef = useRef(true);
  const pendingCloseRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>("");
  const startedAtRef = useRef<string>("");
  const bookedAppointmentRef = useRef<BookedAppointmentInfo | undefined>();

  const chatOpen = sessionState !== "idle";
  const displayName = agentName.trim() || "Assistent";

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
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, agentTyping]);

  const persistChatSession = useCallback(
    async (sessionMessages: ChatMessage[]) => {
      if (sessionMessages.length === 0 || !sessionIdRef.current) return;

      try {
        await fetch("/api/text-assistant/chat/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            agentId,
            agentName: displayName,
            startedAt: startedAtRef.current,
            messages: sessionMessages.map((entry) => ({
              role: entry.role,
              content: entry.content,
            })),
            bookedAppointment: bookedAppointmentRef.current,
          }),
        });
      } catch {
        // Non-blocking — chat UX should still close cleanly.
      }
    },
    [agentId, displayName]
  );

  const closeChat = useCallback(async () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    const sessionMessages = [...messages];
    const appointment = bookedAppointmentRef.current;

    pendingCloseRef.current = false;
    historyRef.current = [];
    sessionIdRef.current = "";
    startedAtRef.current = "";

    setSessionState("idle");
    setConnectionError(null);
    setMessages([]);
    setInput("");
    setAgentTyping(false);

    if (sessionMessages.length > 0) {
      await persistChatSession(sessionMessages);
    }

    if (appointment?.eventId) {
      setBookedAppointment(appointment);
    }
    bookedAppointmentRef.current = undefined;
  }, [messages, persistChatSession]);

  const scheduleCloseAfterAgentReply = useCallback(() => {
    if (!pendingCloseRef.current || closeTimerRef.current) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      void closeChat();
    }, 2000);
  }, [closeChat]);

  const connectChat = useCallback(async () => {
    if (disabled || sessionState === "connecting") return;

    setBookedAppointment(null);
    bookedAppointmentRef.current = undefined;
    setSessionState("connecting");
    setConnectionError(null);
    setMessages([]);
    setInput("");
    historyRef.current = [];
    pendingCloseRef.current = false;
    sessionIdRef.current = crypto.randomUUID();
    startedAtRef.current = new Date().toISOString();

    try {
      const res = await fetch("/api/text-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          draft: draftRef.current,
          history: [],
          userMessage: "__init__",
          channel: "chat",
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        greeting?: string;
        error?: string;
      };

      if (res.status === 503) {
        setSessionState("error");
        const message =
          data.error ??
          "OpenAI ist nicht konfiguriert (ENRICHMENT_API_KEY fehlt).";
        setConnectionError(message);
        toast.error("Chat nicht verfügbar", { description: message });
        return;
      }

      if (res.status === 403) {
        setSessionState("idle");
        const message =
          data.error ??
          "Richten Sie zuerst eine Telefonnummer ein, bevor Sie chatten.";
        toast.error("Keine Telefonnummer", { description: message });
        return;
      }

      const greeting =
        data.greeting?.trim() ||
        draftRef.current.greeting?.trim() ||
        greetingForAssistantName(
          displayName,
          draftRef.current.language === "Schweizerdeutsch"
            ? "Schweizerdeutsch"
            : "Deutsch"
        );

      if (!mountedRef.current) return;

      setMessages([{ id: nextId(), role: "agent", content: greeting }]);
      setSessionState("connected");
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
  }, [agentId, disabled, displayName, sessionState]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sessionState !== "connected" || agentTyping) return;

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: text },
    ]);
    setInput("");
    setAgentTyping(true);

    try {
      const res = await fetch("/api/text-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          draft: draftRef.current,
          history: historyRef.current,
          userMessage: text,
          channel: "chat",
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        history?: TextChatTurn[];
        goalCompleted?: boolean;
        bookedAppointment?: BookedAppointmentInfo;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.reply) {
        throw new Error(data.error ?? "Antwort fehlgeschlagen.");
      }

      if (!mountedRef.current) return;

      historyRef.current = data.history ?? [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: data.reply },
      ];

      if (data.bookedAppointment?.eventId) {
        bookedAppointmentRef.current = data.bookedAppointment;
      }

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "agent", content: data.reply! },
      ]);

      if (data.goalCompleted) {
        pendingCloseRef.current = true;
        scheduleCloseAfterAgentReply();
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error instanceof Error ? error.message : "Antwort fehlgeschlagen.";
      toast.error("Nachricht konnte nicht gesendet werden.", {
        description: message,
      });
    } finally {
      if (mountedRef.current) {
        setAgentTyping(false);
      }
    }
  }, [
    agentId,
    agentTyping,
    input,
    scheduleCloseAfterAgentReply,
    sessionState,
  ]);

  const openChat = useCallback(() => {
    if (chatOpen) return;
    void connectChat();
  }, [chatOpen, connectChat]);

  const canSend =
    sessionState === "connected" && input.trim().length > 0 && !agentTyping;

  const calendarHref = bookedAppointment
    ? `/kalender?event=${encodeURIComponent(bookedAppointment.eventId)}&day=${encodeURIComponent(dayIsoFromStartIso(bookedAppointment.startIso))}`
    : "/kalender";

  return (
    <div className="mt-3">
      {!chatOpen ? (
        <>
          <button
            type="button"
            onClick={openChat}
            disabled={disabled}
            className={cn(landingBtnSecondary, "w-full justify-center")}
          >
            <MessageSquare className="h-3.5 w-3.5 stroke-[1.75]" />
            Chatte mit {displayName}
          </button>

          {bookedAppointment ? (
            <div className="mt-2 rounded-md border border-[#C7D7FF] bg-[#F0F4FF] p-3">
              <div className="flex items-start gap-2.5">
                <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#335cff]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#0E121B]">
                    Termin eingetragen
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#525866]">
                    {bookedAppointment.appointmentType
                      ? `${bookedAppointment.appointmentType} · `
                      : ""}
                    {formatAppointmentWhen(bookedAppointment.startIso)}
                  </p>
                  <Link
                    href={calendarHref}
                    className="mt-2 inline-flex text-[12px] font-medium text-[#335cff] hover:underline"
                  >
                    Zum Termin im Kalender
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setBookedAppointment(null)}
                  className="shrink-0 rounded p-0.5 text-[#99A0AE] hover:bg-white/60 hover:text-[#525866]"
                  aria-label="Hinweis schliessen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </>
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
                </div>
              </div>
            ))}
            {agentTyping && (
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              disabled={sessionState !== "connected" || agentTyping}
              placeholder="Nachricht…"
              className="min-w-0 flex-1 rounded-md border border-[#E1E4EA] bg-white px-3 py-2 text-[13px] text-[#0E121B] placeholder:text-[#99A0AE] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-[#99A0AE]"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!canSend}
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#335cff] px-3 py-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Senden"
            >
              {agentTyping ? (
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
