"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

import { modalBackdropClass } from "@/components/landing/AuthFrame";
import { cn } from "@/lib/utils";

import {
  agentModalButtonClass,
  agentModalInputClass,
  agentModalLabelClass,
  agentModalLinkClass,
  agentModalPanelClass,
  agentModalPillClass,
  agentModalTextareaClass,
  agentModalTitleClass,
  agentModalIconButtonClass,
} from "./agent-modal-styles";

export type AgentWizardDraft = {
  name: string;
  greeting: string;
  systemPrompt: string;
  voiceId: string;
  voiceName?: string;
  language: string;
};

interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

type Step =
  | "branche"
  | "website"
  | "ziel"
  | "gender"
  | "language"
  | "generating"
  | "review";

interface AgentCreateWizardProps {
  open: boolean;
  onClose: () => void;
  voices: VoiceOption[];
  voicesLoading: boolean;
  saving: boolean;
  onSave: (draft: AgentWizardDraft) => void | Promise<void>;
}

export function AgentCreateWizard({
  open,
  onClose,
  voices,
  voicesLoading,
  saving,
  onSave,
}: AgentCreateWizardProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("branche");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [goal, setGoal] = useState("");
  const [gender, setGender] = useState<"male" | "female">("female");
  const [language, setLanguage] = useState<"Deutsch" | "Schweizerdeutsch">(
    "Deutsch"
  );
  const [error, setError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);

  const [draft, setDraft] = useState<AgentWizardDraft | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setStep("branche");
    setIndustry("");
    setWebsite("");
    setGoal("");
    setGender("female");
    setLanguage("Deutsch");
    setError(null);
    setAiHint(null);
    setDraft(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "generating" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, step, saving]);

  async function generate() {
    setStep("generating");
    setError(null);
    setAiHint(null);
    try {
      const res = await fetch("/api/elevenlabs/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, website, goal, gender, language }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Generierung fehlgeschlagen.");
        setStep("language");
        return;
      }

      const next = data.draft as AgentWizardDraft;
      setDraft(next);

      const meta = data.meta as {
        aiGenerated?: boolean;
        websiteAnalyzed?: boolean;
      };
      if (meta?.aiGenerated && meta?.websiteAnalyzed) {
        setAiHint("Vorschlag basiert auf Ihrer Website.");
      } else if (meta?.aiGenerated) {
        setAiHint("Vorschlag von KI erstellt — bitte prüfen.");
      } else {
        setAiHint("Standard-Vorlage — KI-Key im Admin für smarte Vorschläge.");
      }

      setStep("review");
    } catch {
      setError("Netzwerkfehler.");
      setStep("language");
    }
  }

  function updateDraft(patch: Partial<AgentWizardDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handleVoicePick(voiceId: string) {
    const picked = voices.find((v) => v.id === voiceId);
    updateDraft({
      voiceId,
      voiceName: picked?.name,
      language: picked?.language ?? draft?.language,
    });
  }

  async function handleSave() {
    if (!draft?.voiceId || !draft.name.trim() || !draft.greeting.trim()) return;
    await onSave(draft);
  }

  if (!open || !mounted) return null;

  const titles: Record<Step, string> = {
    branche: "Branche",
    website: "Website",
    ziel: "Ziel",
    gender: "Stimme",
    language: "Sprache",
    generating: "Agent wird erstellt…",
    review: "Agent prüfen",
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Schliessen"
        className={modalBackdropClass}
        onClick={step === "generating" || saving ? undefined : onClose}
      />

      <div className={agentModalPanelClass}>
        <button
          type="button"
          onClick={onClose}
          disabled={step === "generating" || saving}
          className={cn(agentModalIconButtonClass, "absolute right-4 top-4")}
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className={agentModalTitleClass}>{titles[step]}</h2>

        <div className="mt-7 space-y-4">
          {step === "branche" && (
            <>
              <input
                autoFocus
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="z.B. Immobilienverwaltung"
                className={agentModalInputClass}
              />
              <button
                type="button"
                disabled={!industry.trim()}
                className={agentModalButtonClass}
                onClick={() => setStep("website")}
              >
                Weiter
              </button>
            </>
          )}

          {step === "website" && (
            <>
              <input
                autoFocus
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://… (optional)"
                className={agentModalInputClass}
              />
              <button
                type="button"
                className={agentModalButtonClass}
                onClick={() => setStep("ziel")}
              >
                Weiter
              </button>
              <button
                type="button"
                className={agentModalLinkClass}
                onClick={() => {
                  setWebsite("");
                  setStep("ziel");
                }}
              >
                Überspringen
              </button>
            </>
          )}

          {step === "ziel" && (
            <>
              <textarea
                autoFocus
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="z.B. Termine vereinbaren, Schadensmeldungen aufnehmen"
                rows={3}
                className={agentModalTextareaClass}
              />
              <button
                type="button"
                disabled={!goal.trim()}
                className={agentModalButtonClass}
                onClick={() => setStep("gender")}
              >
                Weiter
              </button>
            </>
          )}

          {step === "gender" && (
            <>
              <div className="flex gap-2">
                <Pill
                  active={gender === "female"}
                  onClick={() => setGender("female")}
                  label="Weiblich"
                />
                <Pill
                  active={gender === "male"}
                  onClick={() => setGender("male")}
                  label="Männlich"
                />
              </div>
              <button
                type="button"
                className={agentModalButtonClass}
                onClick={() => setStep("language")}
              >
                Weiter
              </button>
            </>
          )}

          {step === "language" && (
            <>
              <div className="flex flex-wrap gap-2">
                <Pill
                  active={language === "Deutsch"}
                  onClick={() => setLanguage("Deutsch")}
                  label="Deutsch"
                />
                <Pill
                  active={language === "Schweizerdeutsch"}
                  onClick={() => setLanguage("Schweizerdeutsch")}
                  label="Schweizerdeutsch"
                />
              </div>
              {error && (
                <p className="text-[13px] text-red-600" role="alert">
                  {error}
                </p>
              )}
              <button type="button" className={agentModalButtonClass} onClick={generate}>
                Agent erstellen
              </button>
            </>
          )}

          {step === "generating" && (
            <div className="space-y-3 py-4 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-navy" />
              <p className="text-[13px] text-text-muted">
                {website.trim()
                  ? "Website wird analysiert…"
                  : "Agent wird vorbereitet…"}
              </p>
            </div>
          )}

          {step === "review" && draft && (
            <>
              {aiHint && (
                <p className="text-[13px] text-text-muted">{aiHint}</p>
              )}

              <label className="block space-y-1.5">
                <span className={agentModalLabelClass}>Name</span>
                <input
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className={agentModalInputClass}
                />
              </label>

              <div className="space-y-1.5">
                <span className={agentModalLabelClass}>Stimme</span>
                {voicesLoading ? (
                  <div className="h-9 animate-pulse rounded-full bg-bg" />
                ) : voices.length === 0 ? (
                  <p className="text-[13px] text-text-muted">Keine Stimmen verfügbar</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {voices.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => handleVoicePick(voice.id)}
                        className={agentModalPillClass(
                          draft.voiceId === voice.id,
                          true
                        )}
                      >
                        {voice.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="block space-y-1.5">
                <span className={agentModalLabelClass}>Begrüssung</span>
                <textarea
                  value={draft.greeting}
                  onChange={(e) => updateDraft({ greeting: e.target.value })}
                  rows={3}
                  className={agentModalTextareaClass}
                />
              </label>

              <label className="block space-y-1.5">
                <span className={agentModalLabelClass}>Anweisungen</span>
                <textarea
                  value={draft.systemPrompt}
                  onChange={(e) =>
                    updateDraft({ systemPrompt: e.target.value })
                  }
                  rows={10}
                  className={cn(agentModalTextareaClass, "font-mono text-[13px]")}
                />
              </label>

              <button
                type="button"
                className={agentModalButtonClass}
                disabled={
                  saving ||
                  !draft.voiceId ||
                  !draft.name.trim() ||
                  !draft.greeting.trim()
                }
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Agent speichern"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={agentModalPillClass(active)}
    >
      {label}
    </button>
  );
}
