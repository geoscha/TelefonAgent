"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  DEMO_USE_CASES,
  type DemoUseCaseId,
} from "@/lib/demo/use-cases";
import {
  LANDING_CONTENT_CLASS,
  LIVE_DEMO_SECTION_ID,
} from "@/components/landing/landing-layout";
import { cn } from "@/lib/utils";

function DemoOrb() {
  return (
    <div className="relative mx-auto flex h-[220px] w-[220px] items-center justify-center sm:h-[260px] sm:w-[260px]">
      <span
        className="absolute inset-[8%] rounded-full opacity-90 blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(34,211,187,0.55) 0%, rgba(37,99,235,0.45) 42%, rgba(99,102,241,0.35) 68%, transparent 100%)",
        }}
        aria-hidden
      />
      <span
        className="absolute inset-[18%] rounded-full shadow-[0_0_48px_rgba(34,211,187,0.35)]"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(34,211,187,0.75) 28%, rgba(59,130,246,0.65) 58%, rgba(129,140,248,0.45) 100%)",
        }}
        aria-hidden
      />
    </div>
  );
}

export function LiveDemoSection() {
  const [useCaseId, setUseCaseId] = useState<DemoUseCaseId>("reception");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const selectedUseCase =
    DEMO_USE_CASES.find((c) => c.id === useCaseId) ?? DEMO_USE_CASES[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/demo/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          useCaseId,
          voice: selectedUseCase.voice,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };

      if (data.ok) {
        setFeedback({
          type: "success",
          message: data.message ?? "Anruf wird verbunden.",
        });
      } else {
        setFeedback({
          type: "error",
          message: data.error ?? "Anruf konnte nicht gestartet werden.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Verbindungsfehler. Bitte erneut versuchen.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id={LIVE_DEMO_SECTION_ID}
      className="scroll-mt-20 pt-2.5 sm:scroll-mt-24 sm:pt-3"
    >
      <div className={LANDING_CONTENT_CLASS}>
        <div className="pb-4 pt-6 sm:pb-6 sm:pt-8">
          <h2 className="font-retell-display text-center text-[clamp(44px,5vw,72px)] font-normal leading-[0.95] tracking-[-0.02em] text-[#0E121B]">
            <span className="block">Testen Sie Ihr</span>
            <span className="block">KI Callcenter</span>
          </h2>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-3">
        <div className="landing-panel flex min-h-[420px] flex-col justify-between border border-[#E1E4EA] p-6 sm:p-8">
          <div className="flex flex-1 flex-col items-center justify-center">
            <DemoOrb />
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-6">
            {DEMO_USE_CASES.map((useCase) => (
              <button
                key={useCase.id}
                type="button"
                onClick={() => setUseCaseId(useCase.id)}
                className={cn(
                  "landing-radius-sm landing-caption px-3 py-1.5 transition-colors",
                  useCaseId === useCase.id
                    ? "bg-[#0E121B] text-white"
                    : "bg-[#F5F7FA] text-[#0E121B] hover:bg-[#EBEEF4]"
                )}
              >
                {useCase.label}
              </button>
            ))}
          </div>
        </div>

        <div className="landing-radius flex min-h-[420px] flex-col bg-[#F5F7FA] p-6 sm:p-8">
          <p className="landing-subtitle max-w-[420px]">
            Erhalten Sie einen Live-Anruf von unserem Telefonagenten und erleben
            Sie, wie Cura Kundengespräche natürlich und effizient abwickelt.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-1 flex-col">
            <div className="space-y-6">
              <label className="block">
                <span className="landing-eyebrow">Anwendungsfall</span>
                <select
                  value={useCaseId}
                  onChange={(e) => setUseCaseId(e.target.value as DemoUseCaseId)}
                  className="landing-body mt-2 w-full border-0 border-b border-[#CACFD8] bg-transparent py-2 text-[#0E121B] outline-none focus:border-[#335cff]"
                >
                  {DEMO_USE_CASES.map((useCase) => (
                    <option key={useCase.id} value={useCase.id}>
                      {useCase.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="landing-eyebrow">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ihr Name"
                  required
                  className="landing-body mt-2 w-full border-0 border-b border-[#CACFD8] bg-transparent py-2 text-[#0E121B] placeholder:text-[#99A0AE] outline-none focus:border-[#335cff]"
                />
              </label>

              <label className="block">
                <span className="landing-eyebrow">Telefonnummer</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+41 79 123 45 67"
                  required
                  autoComplete="tel"
                  className="landing-body mt-2 w-full border-0 border-b border-[#CACFD8] bg-transparent py-2 text-[#0E121B] placeholder:text-[#99A0AE] outline-none focus:border-[#335cff]"
                />
              </label>
            </div>

            {feedback && (
              <p
                className={cn(
                  "landing-body mt-4",
                  feedback.type === "success" ? "text-[#0E121B]" : "text-red-600"
                )}
              >
                {feedback.message}
              </p>
            )}

            <div className="mt-auto pt-8">
              <button
                type="submit"
                disabled={loading}
                className="landing-caption landing-radius-sm inline-flex min-h-10 items-center gap-2 bg-[#0E121B] px-5 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Anruf erhalten
              </button>
            </div>
          </form>
        </div>
        </div>
      </div>
    </section>
  );
}
