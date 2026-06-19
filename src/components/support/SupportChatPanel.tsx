"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { Input } from "@/components/ui/input";
import { userLabelClass, userPanelClass } from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

interface SupportMessageView {
  id: string;
  message: string;
  createdAt: string;
}

interface SupportChatPanelProps {
  active?: boolean;
  className?: string;
}

export function SupportChatPanel({ active = true, className }: SupportChatPanelProps) {
  const [messages, setMessages] = useState<SupportMessageView[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || loaded) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/support")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error("load_failed");
        if (!cancelled) {
          setMessages(data.messages ?? []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Support-Nachrichten konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, loaded]);

  useEffect(() => {
    if (!active) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
    });
  }, [messages, active]);

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setText("");
        setMessages((prev) => [...prev, data.message]);
        toast.success("Nachricht gesendet.");
      } else {
        toast.error(data.error ?? "Senden fehlgeschlagen.");
      }
    } catch {
      toast.error("Senden fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={scrollRef}
          className={cn(
          userPanelClass,
          messages.length > 0 || loading
            ? "flex max-h-[240px] min-h-[100px] flex-col gap-2 overflow-y-auto bg-[#FAFAFA] p-3"
            : "hidden"
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[#525866]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className={userLabelClass}>Laden…</span>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] rounded bg-[#050f1f] px-3 py-2 text-[13px] leading-relaxed text-white">
                {msg.message}
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="flex gap-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ihre Nachricht…"
          disabled={sending}
          className="text-[13px]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className={cn(landingBtnPrimary, "shrink-0 px-4")}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Senden"}
        </button>
      </form>
    </div>
  );
}
