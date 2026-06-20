"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Send, UserRound } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

interface NavigationProposal {
  path: string;
  label: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  navigation?: NavigationProposal;
  escalated?: boolean;
}

interface SupportChatPanelProps {
  active?: boolean;
  className?: string;
  onNavigate?: () => void;
}

interface HistoryTurn {
  role: ChatRole;
  content: string;
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

export function SupportChatPanel({
  active = true,
  className,
  onNavigate,
}: SupportChatPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || greeted) return;
    let cancelled = false;
    setGreeted(true);

    fetch("/api/support/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "__init__" }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && data.greeting) {
          setMessages([
            { id: makeId(), role: "assistant", content: data.greeting },
          ]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([
            {
              id: makeId(),
              role: "assistant",
              content:
                "Hallo! Ich bin der Linker-Support-Assistent. Wie kann ich helfen?",
            },
          ]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, greeted]);

  useEffect(() => {
    if (!active) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, active, sending]);

  async function send(messageText: string) {
    const trimmed = messageText.trim();
    if (!trimmed || sending) return;

    const history: HistoryTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: trimmed },
    ]);
    setText("");
    setSending(true);

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, userMessage: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content: data.reply,
            navigation: data.navigation ?? undefined,
            escalated: Boolean(data.escalated),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content:
              data.error ??
              "Entschuldigung, das hat nicht geklappt. Bitte versuchen Sie es erneut.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: "Netzwerkfehler. Bitte versuchen Sie es erneut.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function escalateToHuman() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Nutzer möchte mit einem Menschen sprechen (Support-Chat).",
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content:
              "Ich habe Ihr Anliegen an unser Support-Team weitergeleitet. Es meldet sich zeitnah bei Ihnen.",
            escalated: true,
          },
        ]);
      } else {
        toast.error(data.error ?? "Weiterleitung fehlgeschlagen.");
      }
    } catch {
      toast.error("Weiterleitung fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  function handleNavigate(nav: NavigationProposal) {
    onNavigate?.();
    router.push(nav.path);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={scrollRef}
        className="flex max-h-[340px] min-h-[200px] flex-col gap-2.5 overflow-y-auto rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-1.5">
            <div
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-[#335cff] text-white"
                    : "bg-white text-[#0E121B] ring-1 ring-[#E1E4EA]"
                )}
              >
                {msg.content}
              </div>
            </div>

            {msg.navigation && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => handleNavigate(msg.navigation!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#335cff]/30 bg-[#335cff]/5 px-3 py-1.5 text-[12px] font-medium text-[#335cff] transition-colors hover:bg-[#335cff]/10"
                >
                  Zu «{msg.navigation.label}»
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {msg.escalated && (
              <div className="flex justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[11px] font-medium text-[#1A7F37]">
                  <UserRound className="h-3 w-3" />
                  An Support-Team weitergeleitet
                </span>
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-[#E1E4EA]">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Frage zu Linker stellen…"
          disabled={sending}
          className="min-w-0 flex-1 rounded-md border border-[#E1E4EA] bg-white px-3 py-2 text-[13px] text-[#0E121B] placeholder:text-[#99A0AE] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#335cff] px-3 py-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Senden"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 stroke-[2]" />
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void escalateToHuman()}
        disabled={sending}
        className="inline-flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#525866] transition-colors hover:text-[#335cff] disabled:opacity-50"
      >
        <UserRound className="h-3.5 w-3.5" />
        Mit einem Menschen sprechen
      </button>
    </div>
  );
}
