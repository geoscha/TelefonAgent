"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Phone, PhoneOff, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { demoGreeting, type DemoMessage } from "@/lib/demo/responses";
import {
  DEMO_VOICE_PRESETS,
  type DemoVoicePresetId,
} from "@/lib/demo/voices";
import {
  getSpeechRecognitionCtor,
  type BrowserSpeechRecognition,
} from "@/lib/demo/speech-recognition";

type ChatEntry = DemoMessage & {
  id: string;
  /** Live-Ticker für Cura — wächst synchron zur Sprachausgabe */
  spokenText?: string;
};

const DEMO_LIMIT_MS = 30_000;

function buildPartialSpeech(fullText: string, progress: number): string {
  if (progress >= 1) return fullText;
  const tokens = fullText.match(/\S+|\s+/g);
  if (!tokens?.length) return fullText;
  if (progress <= 0) return "";

  const wordCount = tokens.filter((t) => t.trim()).length;
  const visibleWords = Math.min(
    wordCount,
    Math.max(1, Math.ceil(progress * wordCount))
  );

  let seen = 0;
  let out = "";
  for (const token of tokens) {
    if (token.trim()) {
      seen++;
      if (seen > visibleWords) break;
    }
    out += token;
  }
  return out;
}

function WaveBars({ active }: { active: boolean }) {
  return (
    <div className="flex h-6 items-end justify-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-white/85 transition-all",
            active ? "animate-pulse" : "h-1.5 opacity-40"
          )}
          style={
            active
              ? {
                  height: `${10 + (i % 3) * 7}px`,
                  animationDelay: `${i * 0.12}s`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

export function DemoBot() {
  const router = useRouter();
  const [voiceId, setVoiceId] = useState<DemoVoicePresetId>("female-de");
  const voice = DEMO_VOICE_PRESETS.find((v) => v.id === voiceId)!;

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [inCall, setInCall] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [demoLocked, setDemoLocked] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoStartedRef = useRef(false);
  const inCallRef = useRef(false);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const inputFocusedRef = useRef(false);
  const messagesRef = useRef<ChatEntry[]>([]);
  const sendMessageRef = useRef<(text: string) => Promise<void>>(
    async () => {}
  );
  const startListeningRef = useRef<() => void>(() => {});

  const queueListen = (ms = 400) => {
    window.setTimeout(() => startListeningRef.current(), ms);
  };

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    inputFocusedRef.current = inputFocused;
  }, [inputFocused]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const patchMessage = useCallback((id: string, patch: Partial<ChatEntry>) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      messagesRef.current = next;
      return next;
    });
  }, []);

  const endCall = useCallback(() => {
    inCallRef.current = false;
    setInCall(false);
    recognitionRef.current?.abort();
    setListening(false);
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  const startDemoTimer = useCallback(() => {
    if (demoStartedRef.current || demoTimerRef.current) return;
    demoStartedRef.current = true;
    demoTimerRef.current = setTimeout(() => {
      endCall();
      setDemoLocked(true);
      router.push("/signup");
    }, DEMO_LIMIT_MS);
  }, [endCall, router]);

  const speakText = useCallback(
    async (text: string, messageId: string) => {
      if (demoLocked) return;

      audioRef.current?.pause();
      setSpeaking(true);
      patchMessage(messageId, { spokenText: "" });

      const playAudio = async (res: Response) => {
        const blob = await res.blob();
        if (!blob.size || (blob.type && !blob.type.startsWith("audio/"))) {
          throw new Error("Invalid audio response");
        }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        const syncSpeech = (progress: number) => {
          patchMessage(messageId, {
            spokenText: buildPartialSpeech(text, progress),
          });
        };

        await new Promise<void>((resolve) => {
          audio.onloadedmetadata = () => syncSpeech(0);
          audio.ontimeupdate = () => {
            if (audio.duration > 0) {
              syncSpeech(Math.min(1, audio.currentTime / audio.duration));
            }
          };
          audio.onended = () => {
            patchMessage(messageId, { spokenText: text });
            setSpeaking(false);
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            patchMessage(messageId, { spokenText: text });
            setSpeaking(false);
            URL.revokeObjectURL(url);
            resolve();
          };
          void audio.play().catch(() => {
            patchMessage(messageId, { spokenText: text });
            setSpeaking(false);
            URL.revokeObjectURL(url);
            resolve();
          });
        });
      };

      try {
        let res = await fetch("/api/demo/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceId }),
        });

        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 400));
          res = await fetch("/api/demo/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice: voiceId }),
          });
        }

        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
            reason?: string;
          } | null;
          setVoiceError(
            err?.reason === "quota_exceeded"
              ? "Sprachkontingent aufgebraucht — Textantworten funktionieren weiter."
              : err?.error ?? "Sprachausgabe nicht verfügbar."
          );
          setVoiceAvailable(false);
          patchMessage(messageId, { spokenText: text });
          setSpeaking(false);
          return;
        }

        await playAudio(res);
        setVoiceAvailable(true);
        setVoiceError(null);
      } catch {
        patchMessage(messageId, { spokenText: text });
        setSpeaking(false);
      }
    },
    [demoLocked, patchMessage, voiceId]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || demoLocked || processingRef.current) return;

      processingRef.current = true;
      setLoading(true);
      recognitionRef.current?.abort();
      setListening(false);

      const userMsg: ChatEntry = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const nextMessages = [...messagesRef.current, userMsg];
      setMessages(nextMessages);
      messagesRef.current = nextMessages;
      setInput("");

      try {
        const res = await fetch("/api/demo/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map(({ role, content }) => ({
              role,
              content,
            })),
            language: voice.language,
            voice: voiceId,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; reply?: string };
        const reply =
          data.ok && data.reply
            ? data.reply
            : "Entschuldigung, ich konnte gerade nicht antworten.";

        const assistantMsg: ChatEntry = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: reply,
          spokenText: "",
        };
        const withReply = [...nextMessages, assistantMsg];
        setMessages(withReply);
        messagesRef.current = withReply;

        setLoading(false);
        await speakText(reply, assistantMsg.id);
        if (inCallRef.current && !demoLocked && !inputFocusedRef.current) {
          queueListen(400);
        }
      } catch {
        const errMsg: ChatEntry = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Verbindung fehlgeschlagen. Bitte erneut versuchen.",
          spokenText: "Verbindung fehlgeschlagen. Bitte erneut versuchen.",
        };
        const withErr = [...nextMessages, errMsg];
        setMessages(withErr);
        messagesRef.current = withErr;
        setLoading(false);
      } finally {
        processingRef.current = false;
      }
    },
    [demoLocked, loading, speakText, voice.language, voiceId]
  );

  const startListening = useCallback(() => {
    if (
      !inCallRef.current ||
      demoLocked ||
      processingRef.current ||
      speakingRef.current ||
      loading ||
      inputFocusedRef.current
    ) {
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = voice.sttLocale;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        void sendMessageRef.current(transcript).then(() => {
          if (inCallRef.current && !demoLocked && !inputFocusedRef.current) {
            queueListen(400);
          }
        });
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      setListening(false);
      if (
        inCallRef.current &&
        !demoLocked &&
        !inputFocusedRef.current &&
        (event.error === "no-speech" || event.error === "network")
      ) {
        queueListen(600);
      }
    };

    recognition.onend = () => {
      setListening(false);
      if (
        inCallRef.current &&
        !demoLocked &&
        !processingRef.current &&
        !speakingRef.current &&
        !inputFocusedRef.current
      ) {
        queueListen(400);
      }
    };

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }, [demoLocked, loading, voice.sttLocale]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    startListeningRef.current = startListening;
  }, [sendMessage, startListening]);

  const startCall = useCallback(async () => {
    if (demoLocked || inCallRef.current) return;

    inCallRef.current = true;
    setInCall(true);
    setVoiceAvailable(true);
    setVoiceError(null);
    startDemoTimer();

    const greeting = demoGreeting(voice.language);
    const greetingId = "greeting";
    const initial: ChatEntry[] = [
      {
        id: greetingId,
        role: "assistant",
        content: greeting,
        spokenText: "",
      },
    ];
    setMessages(initial);
    messagesRef.current = initial;

    await speakText(greeting, greetingId);

    if (inCallRef.current && !demoLocked && !inputFocusedRef.current) {
      startListeningRef.current();
    }
  }, [demoLocked, speakText, startDemoTimer, voice.language]);

  const toggleCall = useCallback(() => {
    if (demoLocked) return;
    if (inCallRef.current) {
      endCall();
      return;
    }
    void startCall();
  }, [demoLocked, endCall, startCall]);

  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    recognitionRef.current?.abort();
    setListening(false);
  }, []);

  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    if (inCallRef.current && !demoLocked && !speakingRef.current) {
      queueListen(300);
    }
  }, [demoLocked]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      inCallRef.current = false;
      audioRef.current?.pause();
      recognitionRef.current?.abort();
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!inCallRef.current) return;
    endCall();
    setMessages([]);
    messagesRef.current = [];
  }, [voiceId, endCall]);

  const showTranscript = inCall;
  const busy = loading || speaking;
  const showWaves = inCall && (listening || speaking || loading);

  const displayText = (entry: ChatEntry) =>
    entry.role === "assistant"
      ? (entry.spokenText ?? entry.content)
      : entry.content;

  return (
    <div className="relative w-full max-w-[340px]">
      <div
        className={cn(
          "landing-glass flex flex-col overflow-hidden rounded-[22px] transition-[filter,opacity]",
          demoLocked && "pointer-events-none blur-md"
        )}
      >
        <div className="flex flex-wrap justify-center gap-1.5 px-4 pt-4">
          {DEMO_VOICE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={demoLocked || inCall || busy}
              onClick={() => setVoiceId(preset.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                voiceId === preset.id
                  ? "bg-white text-navy"
                  : "bg-white/12 text-white/80 hover:bg-white/20"
              )}
            >
              {preset.shortLabel}
            </button>
          ))}
        </div>

        <div className="px-4 py-3">
          <WaveBars active={showWaves} />
        </div>

        {showTranscript && (
          <div
            ref={scrollRef}
            className="flex max-h-[220px] min-h-[100px] flex-col gap-2.5 overflow-y-auto px-4 pb-2 sm:max-h-[260px]"
          >
            {messages.map((entry) => {
              const text = displayText(entry);
              if (entry.role === "assistant" && !text && !loading) return null;

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex",
                    entry.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[90%] rounded-[16px] px-3.5 py-2.5 text-[14px] leading-relaxed",
                      entry.role === "user"
                        ? "bg-white/90 text-navy"
                        : "bg-white/12 text-white"
                    )}
                  >
                    {text}
                    {entry.role === "assistant" &&
                      speaking &&
                      entry.spokenText !== entry.content && (
                        <span className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse bg-white/70 align-middle" />
                      )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-[16px] bg-white/12 px-3.5 py-2.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {inCall && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-white/15 px-4 py-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="Nachfragen…"
              disabled={demoLocked || loading}
              className="h-10 flex-1 rounded-full border border-white/20 bg-white/10 px-4 text-[14px] text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/25"
            />
            <button
              type="submit"
              disabled={demoLocked || loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-navy transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label="Senden"
            >
              <Send className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2 px-4 pb-5 pt-1">
          <button
            type="button"
            onClick={toggleCall}
            disabled={demoLocked}
            aria-label={inCall ? "Anruf beenden" : "Agent anrufen"}
            className={cn(
              "relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all",
              inCall
                ? "bg-white text-navy ring-4 ring-white/30"
                : "bg-white/95 text-navy hover:bg-white",
              demoLocked && "opacity-50"
            )}
          >
            {inCall && busy && !listening ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : inCall ? (
              <PhoneOff className="h-7 w-7" strokeWidth={1.5} />
            ) : (
              <Phone className="h-7 w-7" strokeWidth={1.5} />
            )}
            {inCall && (
              <span className="absolute inset-0 animate-pulse-ring rounded-full ring-2 ring-white/50" />
            )}
          </button>

          {!voiceAvailable && voiceError && (
            <p className="text-center text-[12px] text-white/55">{voiceError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
