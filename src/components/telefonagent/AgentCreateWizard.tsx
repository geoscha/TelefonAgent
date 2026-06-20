"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { cn } from "@/lib/utils";
import { useVoicePreview } from "@/lib/hooks/useVoicePreview";
import { normalizeAgentLanguage } from "@/lib/elevenlabs/agent-config";
import {
  greetingForAssistantName,
  shouldAutoRenameAssistant,
} from "@/lib/elevenlabs/assistant-names";
import {
  ASSISTANT_BRANCH_OPTIONS,
  type AssistantBranchId,
} from "@/lib/assistant-branch";
import { VoiceChoiceGroup } from "@/components/telefonagent/VoiceChoiceGroup";

import type { BusinessHoursSchedule } from "@/lib/integrations/business-hours";

export type AgentWizardDraft = {
  name: string;
  greeting: string;
  systemPrompt: string;
  voiceId: string;
  voiceName?: string;
  language: string;
  website?: string;
  businessHours?: BusinessHoursSchedule;
  assistantBranch: AssistantBranchId;
};

interface VoiceOption {
  id: string;
  name: string;
  displayName?: string;
  language: string;
  gender?: "male" | "female";
}

type Step =
  | "branche"
  | "website"
  | "language"
  | "generating"
  | "review_name"
  | "review_voice"
  | "review_greeting";

interface AgentCreateWizardProps {
  onClose: () => void;
  voices: VoiceOption[];
  voicesLoading: boolean;
  saving: boolean;
  onSave: (draft: AgentWizardDraft) => void | Promise<void>;
}

const fieldClass =
  "landing-body landing-radius-sm h-10 w-full border border-[#E1E4EA] bg-white px-3 py-2 text-[#0E121B] placeholder:text-[#99A0AE] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20";

export function AgentCreateWizard({
  onClose,
  voices,
  voicesLoading,
  saving,
  onSave,
}: AgentCreateWizardProps) {
  const demo = useSetupDemoOptional();
  const demoActive = Boolean(demo?.active && demo.step === "agent");

  function demoGoTo(stepId: string) {
    if (demoActive) demo?.goToSubStep(stepId);
  }

  const [step, setStep] = useState<Step>("branche");
  const [assistantBranch, setAssistantBranch] =
    useState<AssistantBranchId>("private_assistant");
  const [website, setWebsite] = useState("");
  const [language, setLanguage] = useState<"Deutsch" | "Schweizerdeutsch">(
    "Deutsch"
  );
  const [error, setError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentWizardDraft | null>(null);
  const nameIsAutoRef = useRef(true);
  const { previewVoice } = useVoicePreview();

  function advanceAfterBranche() {
    if (assistantBranch === "private_assistant") {
      setWebsite("");
      setStep("language");
      demoGoTo("agent_language");
      return;
    }
    setStep("website");
    demoGoTo("agent_website");
  }

  useEffect(() => {
    if (demoActive) demo?.goToSubStep("agent_branche");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titles: Record<Step, string> = {
    branche: "Branche",
    website: "Website",
    language: "Sprache",
    generating: "Assistent wird erstellt…",
    review_name: "Name",
    review_voice: "Stimme wählen",
    review_greeting: "Begrüssung",
  };

  async function generate() {
    setStep("generating");
    if (demoActive) demo?.goToSubStep("agent_generating");
    setError(null);
    setAiHint(null);
    try {
      const res = await fetch("/api/elevenlabs/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: assistantBranch,
          website:
            assistantBranch === "coiffeur" ? website.trim() || undefined : undefined,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Generierung fehlgeschlagen.");
        setStep("language");
        return;
      }

      const next = data.draft as AgentWizardDraft;
      setDraft(next);
      nameIsAutoRef.current = true;

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

      setStep("review_name");
      if (demoActive) demo?.goToSubStep("agent_review_name");
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
    const displayName = picked?.displayName ?? picked?.name ?? "";
    const previousDisplayName = voices.find((v) => v.id === draft?.voiceId)
      ?.displayName;

    const patch: Partial<AgentWizardDraft> = {
      voiceId,
      voiceName: picked?.name,
      language: picked?.language ?? draft?.language,
    };

    if (
      draft &&
      shouldAutoRenameAssistant(draft.name, previousDisplayName)
    ) {
      patch.name = displayName;
      patch.greeting = greetingForAssistantName(
        displayName,
        normalizeAgentLanguage(draft.language ?? language)
      );
      nameIsAutoRef.current = true;
    }

    updateDraft(patch);

    if (picked) {
      void previewVoice(
        picked.id,
        displayName,
        picked.language ?? draft?.language ?? language
      );
    }
  }

  async function handleSave() {
    if (!draft?.voiceId || !draft.name.trim() || !draft.greeting.trim()) return;
    await onSave({
      ...draft,
      website: website.trim() || undefined,
      assistantBranch,
    });
  }

  function goBack() {
    const prev: Partial<Record<Step, Step>> = {
      website: "branche",
      language:
        assistantBranch === "coiffeur" ? "website" : "branche",
      review_name: "language",
      review_voice: "review_name",
      review_greeting: "review_voice",
    };
    const target = prev[step];
    if (target) setStep(target);
  }

  return (
    <div
      className={cn(
        userPanelClass,
        "flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E1E4EA] px-5 py-4">
        <p className={userTitleClass}>{titles[step]}</p>
        <button
          type="button"
          onClick={onClose}
          disabled={step === "generating" || saving}
          className={cn(landingBtnSecondary, "shrink-0")}
        >
          Abbrechen
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6 sm:py-6">
        {step === "branche" && (
          <StepBody onSubmit={advanceAfterBranche}>
            <FieldRow label="Branche">
              <select
                autoFocus
                data-setup-demo="setup-demo-agent-branche"
                value={assistantBranch}
                onChange={(e) =>
                  setAssistantBranch(e.target.value as AssistantBranchId)
                }
                className={fieldClass}
              >
                {ASSISTANT_BRANCH_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldRow>
            <StepFooter />
          </StepBody>
        )}

        {step === "website" && (
          <StepBody
            onSubmit={() => {
              setStep("language");
              demoGoTo("agent_language");
            }}
          >
            <FieldRow label="Website (optional)">
              <input
                autoFocus
                data-setup-demo="setup-demo-agent-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={fieldClass}
              />
            </FieldRow>
            <StepFooter>
              <SecondaryStepActions
                onBack={goBack}
                secondaryLabel="Überspringen"
                onSecondary={() => {
                  setWebsite("");
                  setStep("language");
                  demoGoTo("agent_language");
                }}
              />
            </StepFooter>
          </StepBody>
        )}

        {step === "language" && (
          <StepBody onSubmit={generate}>
            <FieldRow
              label="Sprache"
              nextLabel="Assistent erstellen"
              nextDataDemo="setup-demo-agent-language-create"
            >
              <div
                className="flex flex-wrap gap-2"
                data-setup-demo="setup-demo-agent-language"
              >
                <ChoicePill
                  active={language === "Deutsch"}
                  onClick={() => setLanguage("Deutsch")}
                  label="Deutsch"
                />
                <ChoicePill
                  active={language === "Schweizerdeutsch"}
                  onClick={() => setLanguage("Schweizerdeutsch")}
                  label="Schweizerdeutsch"
                />
              </div>
            </FieldRow>
            {error && (
              <p className="mt-2 text-[12px] text-red-600" role="alert">
                {error}
              </p>
            )}
            <StepFooter>
              <SecondaryStepActions onBack={goBack} />
            </StepFooter>
          </StepBody>
        )}

        {step === "generating" && (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center"
            data-setup-demo="setup-demo-agent-generating"
          >
            <Loader2 className="h-7 w-7 animate-spin text-[#050f1f]" />
            <p className={userLabelClass}>
              {website.trim()
                ? "Website wird analysiert…"
                : "Assistent wird vorbereitet…"}
            </p>
          </div>
        )}

        {step === "review_name" && draft && (
          <StepBody
            onSubmit={() => {
              setStep("review_voice");
              demoGoTo("agent_review_voice");
            }}
            submitDisabled={!draft.name.trim()}
          >
            {aiHint && (
              <p className={cn(userLabelClass, "mb-2")}>{aiHint}</p>
            )}
            <FieldRow
              label="Name des Assistenten"
              nextDisabled={!draft.name.trim()}
            >
              <input
                autoFocus
                data-setup-demo="setup-demo-agent-review-name"
                value={draft.name}
                onChange={(e) => {
                  nameIsAutoRef.current = false;
                  updateDraft({ name: e.target.value });
                }}
                className={fieldClass}
              />
            </FieldRow>
            <StepFooter>
              <SecondaryStepActions onBack={goBack} />
            </StepFooter>
          </StepBody>
        )}

        {step === "review_voice" && draft && (
          <StepBody
            onSubmit={() => {
              setStep("review_greeting");
              demoGoTo("agent_review_greeting");
            }}
            submitDisabled={!draft.voiceId}
          >
            <FieldRow label="Stimme" align="start" nextDisabled={!draft.voiceId}>
              {voicesLoading ? (
                <div className="h-10 animate-pulse rounded border border-[#E1E4EA] bg-[#F5F7FA]" />
              ) : voices.length === 0 ? (
                <p className={userLabelClass}>Keine Stimmen verfügbar</p>
              ) : (
                <div data-setup-demo="setup-demo-agent-review-voice">
                  <VoiceChoiceGroup
                    voices={voices}
                    value={draft.voiceId}
                    onChange={handleVoicePick}
                  />
                </div>
              )}
            </FieldRow>
            <StepFooter>
              <SecondaryStepActions onBack={goBack} />
            </StepFooter>
          </StepBody>
        )}

        {step === "review_greeting" && draft && (
          <StepBody
            onSubmit={handleSave}
            submitDisabled={
              saving ||
              !draft.voiceId ||
              !draft.name.trim() ||
              !draft.greeting.trim()
            }
          >
            <FieldRow
              label="Begrüssung"
              nextLabel="Assistent speichern"
              nextDisabled={
                saving ||
                !draft.voiceId ||
                !draft.name.trim() ||
                !draft.greeting.trim()
              }
              nextLoading={saving}
              nextDataDemo="setup-demo-agent-review-save"
            >
              <input
                autoFocus
                data-setup-demo="setup-demo-agent-review-greeting"
                value={draft.greeting}
                onChange={(e) => updateDraft({ greeting: e.target.value })}
                className={fieldClass}
              />
            </FieldRow>
            <StepFooter>
              <SecondaryStepActions onBack={goBack} />
            </StepFooter>
          </StepBody>
        )}
      </div>
    </div>
  );
}

function StepBody({
  children,
  dataDemo,
  onSubmit,
  submitDisabled,
  grow = false,
}: {
  children: ReactNode;
  dataDemo?: string;
  onSubmit?: () => void | Promise<void>;
  submitDisabled?: boolean;
  grow?: boolean;
}) {
  return (
    <form
      data-setup-demo={dataDemo}
      className={cn("flex w-full flex-col", grow && "min-h-0 flex-1")}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.defaultPrevented || submitDisabled || !onSubmit) {
          return;
        }
        const target = e.target;
        if (
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLButtonElement && target.type === "button")
        ) {
          return;
        }
        e.preventDefault();
        void onSubmit();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (submitDisabled || !onSubmit) return;
        void onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function StepFooter({ children }: { children?: ReactNode }) {
  return (
    <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2">
      {children}
    </div>
  );
}

function FieldRow({
  label,
  children,
  align = "center",
  nextLabel = "Weiter",
  nextDisabled,
  nextLoading,
  nextDataDemo,
  grow = false,
}: {
  label: string;
  children: ReactNode;
  align?: "center" | "start";
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  nextDataDemo?: string;
  grow?: boolean;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-2", grow && "min-h-0 flex-1")}>
      <p className={userLabelClass}>{label}</p>
      <div
        className={cn(
          "flex w-full gap-3",
          align === "start" ? "items-start" : "items-center",
          grow && "min-h-0 flex-1"
        )}
      >
        <div className={cn("min-w-0 flex-1", grow && "flex min-h-0 flex-col")}>
          {children}
        </div>
        <button
          type="submit"
          data-setup-demo={nextDataDemo}
          disabled={nextDisabled || nextLoading}
          className={cn(
            landingBtnPrimary,
            "h-10 shrink-0 self-center whitespace-nowrap px-4",
            nextLabel.length > 8 ? "min-w-[8.75rem]" : "min-w-[5.5rem]"
          )}
        >
          {nextLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            nextLabel
          )}
        </button>
      </div>
    </div>
  );
}

function SecondaryStepActions({
  onBack,
  onSecondary,
  secondaryLabel,
}: {
  onBack?: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
}) {
  if (!onBack && !onSecondary) return null;

  return (
    <>
      {onBack && (
        <button type="button" onClick={onBack} className={landingBtnSecondary}>
          Zurück
        </button>
      )}
      {onSecondary && secondaryLabel && (
        <button type="button" onClick={onSecondary} className={landingBtnSecondary}>
          {secondaryLabel}
        </button>
      )}
    </>
  );
}

function ChoicePill({
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
      className={cn(
        "rounded px-3 py-1.5 text-[13px] font-normal transition-colors",
        active
          ? "bg-[#050f1f] text-white"
          : "border border-[#E1E4EA] text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
      )}
    >
      {label}
    </button>
  );
}
