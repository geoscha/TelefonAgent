"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import type { AgentWizardDraft } from "@/components/telefonagent/AgentCreateWizard";
import { AgentCapabilityLogos } from "@/components/telefonagent/AgentCapabilityLogos";
import { AgentCapabilitiesSection } from "@/components/telefonagent/AgentCapabilitiesSection";
import { AgentTestChat } from "@/components/telefonagent/AgentTestChat";
import { AgentDetailSection } from "@/components/telefonagent/AgentDetailSection";
import { VoiceSelect } from "@/components/telefonagent/VoiceSelect";
import {
  userLabelClass,
  userPanelClass,
  userStatClass,
} from "@/components/user/user-styles";
import { Switch } from "@/components/ui/switch";
import {
  formatAgentUsageDuration,
} from "@/lib/billing/quota-display";
import {
  AGENT_LANGUAGE_OPTIONS,
  normalizeAgentLanguage,
  type AgentLanguageLabel,
} from "@/lib/elevenlabs/agent-config";
import {
  greetingForAssistantName,
  shouldAutoRenameAssistant,
} from "@/lib/elevenlabs/assistant-names";
import {
  composeSystemPrompt,
  countInstructionWords,
  MAX_AGENT_INSTRUCTION_WORDS,
  parseSystemPrompt,
} from "@/lib/elevenlabs/prompt-sections";
import type { StoredAgent } from "@/lib/onboarding-types";
import {
  ASSISTANT_BRANCH_OPTIONS,
  assistantBranchLabel,
  inferAssistantBranch,
  type AssistantBranchId,
} from "@/lib/assistant-branch";
import { cn } from "@/lib/utils";
import { useVoicePreview } from "@/lib/hooks/useVoicePreview";

interface VoiceOption {
  id: string;
  name: string;
  displayName?: string;
  language: string;
}

export type AgentDetailUpdate = Partial<
  AgentWizardDraft & {
    systemPrompt: string;
    euComplianceEnabled: boolean;
    website: string;
    escalationPhoneNumber: string;
    medicalGuardrailsEnabled: boolean;
  }
>;

interface AgentPhoneNumber {
  id: string;
  phoneNumber: string;
  label?: string;
  customerNumber?: string;
  source?: "pool" | "sip_trunk";
  forwardingStatus?: string;
  isPrimary?: boolean;
}

interface AgentDetailPanelProps {
  agent: StoredAgent;
  isActive: boolean;
  customerNumber?: string;
  voices: VoiceOption[];
  voicesLoading: boolean;
  deleting: boolean;
  saving?: boolean;
  saveError?: boolean;
  phoneNumbers?: AgentPhoneNumber[];
  allAgents?: Pick<StoredAgent, "id" | "name" | "phoneNumberId">[];
  assigningPhone?: boolean;
  onAssignPhone?: (phoneNumberId: string | null) => void;
  onDelete: () => void;
  onActivate?: () => void;
  onDeactivate?: () => void;
  activating?: boolean;
  onUpdate: (patch: AgentDetailUpdate) => void | Promise<void>;
  onAgentsChange?: (agents: StoredAgent[]) => void;
}

const fieldClass =
  "landing-body landing-radius-sm w-full border border-[#E1E4EA] bg-white px-3 py-2 text-[#0E121B] placeholder:text-[#99A0AE] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20";

const textareaClass = cn(fieldClass, "min-h-0 resize-y");

const AUTOSAVE_MS = 700;

function ToggleRow({
  label,
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-[#E1E4EA] bg-[#FAFAFA] px-3 py-2.5">
      <span className="text-[13px] text-[#0E121B]">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    </div>
  );
}

function resolvePrimaryAgentNumber(
  phoneNumbers: AgentPhoneNumber[],
  agentPhoneNumberId?: string
): string | null {
  if (!agentPhoneNumberId) return null;
  return phoneNumbers.find((p) => p.id === agentPhoneNumberId)?.phoneNumber ?? null;
}

function availablePhonesForAgent(
  phoneNumbers: AgentPhoneNumber[],
  agents: Pick<StoredAgent, "id" | "phoneNumberId">[] | undefined,
  currentAgentId: string
): AgentPhoneNumber[] {
  return phoneNumbers.filter((phone) => {
    const owner = agents?.find((a) => a.phoneNumberId === phone.id);
    return !owner || owner.id === currentAgentId;
  });
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className={userLabelClass}>{label}</p>
      {children}
    </div>
  );
}

export function AgentDetailPanel({
  agent,
  isActive,
  voices,
  voicesLoading,
  deleting,
  saving = false,
  saveError = false,
  phoneNumbers = [],
  allAgents = [],
  assigningPhone = false,
  onAssignPhone,
  onDelete,
  onActivate,
  onDeactivate,
  activating = false,
  onUpdate,
  onAgentsChange,
}: AgentDetailPanelProps) {
  const [name, setName] = useState(agent.name);
  const [greeting, setGreeting] = useState(agent.greeting);
  const [voiceId, setVoiceId] = useState(agent.voiceId);
  const [language, setLanguage] = useState<AgentLanguageLabel>(() =>
    normalizeAgentLanguage(agent.language)
  );
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [euComplianceEnabled, setEuComplianceEnabled] = useState(
    Boolean(agent.euComplianceEnabled)
  );
  const [website, setWebsite] = useState(agent.website ?? "");
  const [assistantBranch, setAssistantBranch] = useState<AssistantBranchId>(() =>
    inferAssistantBranch(agent)
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [usageSeconds, setUsageSeconds] = useState<number | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const nameIsAutoRef = useRef(
    shouldAutoRenameAssistant(agent.name, agent.voiceName)
  );
  const { previewVoice } = useVoicePreview();

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraft = useRef({
    name: agent.name,
    greeting: agent.greeting,
    voiceId: agent.voiceId,
    voiceName: agent.voiceName,
    language: agent.language,
    systemPrompt: agent.systemPrompt,
    euComplianceEnabled: Boolean(agent.euComplianceEnabled),
    website: agent.website ?? "",
  });

  useEffect(() => {
    setName(agent.name);
    setGreeting(agent.greeting);
    setVoiceId(agent.voiceId);
    setLanguage(normalizeAgentLanguage(agent.language));
    setSystemPrompt(agent.systemPrompt);
    setEuComplianceEnabled(Boolean(agent.euComplianceEnabled));
    setWebsite(agent.website ?? "");
    setAssistantBranch(inferAssistantBranch(agent));
    nameIsAutoRef.current = shouldAutoRenameAssistant(
      agent.name,
      voices.find((voice) => voice.id === agent.voiceId)?.displayName ??
        agent.voiceName
    );
    latestDraft.current = {
      name: agent.name,
      greeting: agent.greeting,
      voiceId: agent.voiceId,
      voiceName: agent.voiceName,
      language: agent.language,
      systemPrompt: agent.systemPrompt,
      euComplianceEnabled: Boolean(agent.euComplianceEnabled),
      website: agent.website ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when switching agents
  }, [agent.id]);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    fetch(`/api/elevenlabs/agent/usage?agentId=${encodeURIComponent(agent.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error("usage_failed");
        if (!cancelled) setUsageSeconds(Number(data.totalSeconds) || 0);
      })
      .catch(() => {
        if (!cancelled) setUsageSeconds(0);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  function scheduleSave(patch: AgentDetailUpdate, immediate = false) {
    latestDraft.current = { ...latestDraft.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) {
      void onUpdate(latestDraft.current);
      return;
    }
    saveTimer.current = setTimeout(() => {
      void onUpdate(latestDraft.current);
    }, AUTOSAVE_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function patchSystemPrompt(
    patch: Partial<ReturnType<typeof parseSystemPrompt>>
  ) {
    const parsed = parseSystemPrompt(systemPrompt);
    const next = composeSystemPrompt({ ...parsed, ...patch });
    setSystemPrompt(next);
    scheduleSave({ systemPrompt: next });
    return next;
  }

  function handleNameChange(value: string) {
    setName(value);
    nameIsAutoRef.current = false;
    scheduleSave({ name: value });
  }

  function handleGreetingChange(value: string) {
    setGreeting(value);
    scheduleSave({ greeting: value });
  }

  function handleVoiceChange(nextVoiceId: string) {
    const picked = voices.find((v) => v.id === nextVoiceId);
    const previous = voices.find((v) => v.id === voiceId);
    const displayName = picked?.displayName ?? picked?.name ?? "Stimme";
    setVoiceId(nextVoiceId);

    const patch: AgentDetailUpdate = {
      voiceId: nextVoiceId,
      voiceName: picked?.name,
      language: picked?.language ?? language,
    };

    if (shouldAutoRenameAssistant(name, previous?.displayName)) {
      const nextName = displayName;
      const nextGreeting = greetingForAssistantName(
        nextName,
        (picked?.language ?? language) as AgentLanguageLabel
      );
      setName(nextName);
      setGreeting(nextGreeting);
      patch.name = nextName;
      patch.greeting = nextGreeting;
      nameIsAutoRef.current = true;
    }

    scheduleSave(patch);

    if (picked) {
      void previewVoice(
        picked.id,
        displayName,
        picked.language ?? language
      );
    }
  }

  function handleLanguageChange(value: string) {
    const nextLanguage = normalizeAgentLanguage(value);
    setLanguage(nextLanguage);

    const patch: AgentDetailUpdate = { language: nextLanguage };
    const previousDefault = greetingForAssistantName(name, language);
    const nextDefault = greetingForAssistantName(name, nextLanguage);
    if (greeting.trim() === previousDefault.trim()) {
      setGreeting(nextDefault);
      patch.greeting = nextDefault;
    }

    scheduleSave(patch);
  }

  function handleSystemPromptChange(value: string) {
    setSystemPrompt(value);
    scheduleSave({ systemPrompt: value });
  }

  function handleWebsiteChange(value: string) {
    setWebsite(value);
    scheduleSave({ website: value });
  }

  function handleBranchChange(branch: AssistantBranchId) {
    setAssistantBranch(branch);
    const label = assistantBranchLabel(branch);
    const nextPrompt = patchSystemPrompt({ branche: label, ziel: "" });
    scheduleSave(
      {
        assistantBranch: branch,
        systemPrompt: nextPrompt,
      },
      true
    );
  }

  async function handleAiFill() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/elevenlabs/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: assistantBranch,
          website: website.trim() || undefined,
          language: agent.language,
          keepVoice: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error("KI-Ausfüllen fehlgeschlagen", {
          description: data.error,
        });
        return;
      }

      const draft = data.draft as {
        name: string;
        greeting: string;
        systemPrompt: string;
        language?: string;
      };
      const parsed = parseSystemPrompt(draft.systemPrompt);
      const composed = composeSystemPrompt(parsed);

      setName(draft.name);
      setGreeting(draft.greeting);
      setSystemPrompt(composed);

      scheduleSave(
        {
          name: draft.name,
          greeting: draft.greeting,
          systemPrompt: composed,
          website,
          language: draft.language ?? agent.language,
        },
        true
      );

      if (data.meta?.websiteAnalyzed) {
        toast.success("Felder ausgefüllt — Website wurde analysiert.");
      } else if (website.trim()) {
        toast.success("Felder ausgefüllt — Website konnte nicht gelesen werden.");
      } else {
        toast.success("Felder mit KI ausgefüllt.");
      }
    } catch {
      toast.error("Netzwerkfehler beim KI-Ausfüllen");
    } finally {
      setAiLoading(false);
    }
  }

  function handleComplianceToggle(enabled: boolean) {
    setEuComplianceEnabled(enabled);
    scheduleSave({ euComplianceEnabled: enabled }, true);
  }

  const canActivateAgent = Boolean(agent.phoneNumberId?.trim());

  function handleActiveToggle(active: boolean) {
    if (activating) return;
    if (active) {
      if (!canActivateAgent) {
        toast.error("Keine Telefonnummer", {
          description:
            "Wählen Sie unter Konfiguration eine Telefonnummer aus, bevor Sie den Assistenten aktivieren.",
        });
        return;
      }
      onActivate?.();
    } else {
      onDeactivate?.();
    }
  }

  const selectedPhoneId = agent.phoneNumberId ?? "";
  const selectablePhones = availablePhonesForAgent(
    phoneNumbers,
    allAgents,
    agent.id
  );

  const primaryAgentNumber = resolvePrimaryAgentNumber(
    phoneNumbers,
    selectedPhoneId || undefined
  );

  const voiceOptions =
    voices.length > 0
      ? voices.map((voice) => ({
          ...voice,
          name: voice.displayName ?? voice.name,
        }))
      : voiceId
        ? [
            {
              id: voiceId,
              name: agent.name || agent.voiceName || "Stimme",
              language: agent.language,
            },
          ]
        : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col self-stretch overflow-y-auto">
      <div
        className={cn(
          userPanelClass,
          "flex min-h-full flex-1 flex-col p-5 sm:p-6"
        )}
      >
        <div className="sticky top-0 z-10 -mx-5 border-b border-[#E1E4EA] bg-white px-5 pb-4 pt-0 sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                aria-label="Assistentenname"
                className={cn(
                  fieldClass,
                  "text-[18px] font-semibold leading-tight sm:text-[20px]"
                )}
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4">
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2",
                  isActive
                    ? "border-[#22c55e]/50 bg-[#f0fdf4]"
                    : "border-[#E1E4EA] bg-[#FAFAFA]"
                )}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    isActive ? "bg-[#22c55e]" : "bg-[#99A0AE]"
                  )}
                  aria-hidden
                />
                <span className="text-[13px] font-semibold text-[#0E121B]">
                  {isActive ? "Aktiv" : "Inaktiv"}
                </span>
                <Switch
                  checked={isActive}
                  onCheckedChange={handleActiveToggle}
                  aria-label="Assistent aktivieren oder deaktivieren"
                  disabled={activating || (!isActive && !canActivateAgent)}
                />
              </div>

              <div className="flex min-w-0 items-center border-[#E1E4EA] sm:border-l sm:pl-4">
                <span
                  className={cn(
                    "truncate font-mono text-[20px] font-semibold tabular-nums sm:text-[22px]",
                    primaryAgentNumber ? "text-[#0E121B]" : "text-[#99A0AE]"
                  )}
                >
                  {primaryAgentNumber ?? "Keine Nummer"}
                </span>
              </div>
            </div>
          </div>

          {!canActivateAgent && (
            <p className="mt-2 text-[12px] text-[#99A0AE]">
              Chat und Aktivierung sind erst möglich, wenn unter Konfiguration
              eine Telefonnummer ausgewählt ist.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-4">
            <p className={cn(userStatClass, "min-w-0")}>
              {usageLoading
                ? "…"
                : formatAgentUsageDuration(usageSeconds ?? 0)}
            </p>
            <AgentCapabilityLogos
              agent={agent}
              agentPhoneNumberId={selectedPhoneId || agent.phoneNumberId}
            />
          </div>

          <AgentTestChat
            agentId={agent.id}
            agentName={name}
            disabled={!agent.id || !canActivateAgent}
            draft={{
              greeting,
              systemPrompt,
              language,
              voiceId,
              euComplianceEnabled,
              appointmentBookingEnabled: agent.appointmentBookingEnabled,
              appointmentConfig: agent.appointmentConfig,
            }}
          />

          {(saving || saveError) && (
            <p className="mt-2 text-[11px] text-[#99A0AE]">
              {saving ? "Speichert…" : "Speichern fehlgeschlagen"}
            </p>
          )}
        </div>

        <div key={agent.id} className="mt-4 flex-1 space-y-2">
          <AgentDetailSection
            title="Konfiguration"
            subtitle="Stimme, Sprache und Nummer"
          >
            <LabeledField label="Stimme">
              <VoiceSelect
                voices={voiceOptions}
                value={voiceId}
                onChange={handleVoiceChange}
                loading={voicesLoading}
              />
            </LabeledField>

            <LabeledField label="Sprache">
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className={fieldClass}
              >
                {AGENT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </LabeledField>

            {phoneNumbers.length > 0 && (
              <LabeledField label="Telefonnummer">
                <select
                  value={selectedPhoneId}
                  disabled={assigningPhone || !onAssignPhone}
                  onChange={(e) => {
                    onAssignPhone?.(e.target.value || null);
                  }}
                  className={fieldClass}
                >
                  <option value="">Keine Nummer</option>
                  {selectablePhones.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.phoneNumber}
                      {p.label ? ` · ${p.label}` : ""}
                    </option>
                  ))}
                </select>
              </LabeledField>
            )}
          </AgentDetailSection>

          <AgentDetailSection
            title="Fähigkeiten"
            subtitle="Was der Assistent für Anrufer tun darf"
          >
            <AgentCapabilitiesSection
              agent={agent}
              onAgentsChange={onAgentsChange}
            />
          </AgentDetailSection>

          <AgentDetailSection
            title="Charakter"
            subtitle="Branche, Website, Begrüssung und Anweisungen"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <LabeledField label="Branche">
                  <select
                    value={assistantBranch}
                    onChange={(e) =>
                      handleBranchChange(e.target.value as AssistantBranchId)
                    }
                    className={fieldClass}
                  >
                    {ASSISTANT_BRANCH_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </LabeledField>
              </div>
              <button
                type="button"
                onClick={() => void handleAiFill()}
                disabled={aiLoading || saving}
                className={cn(
                  landingBtnPrimary,
                  "inline-flex shrink-0 items-center gap-2 self-end sm:self-auto"
                )}
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {aiLoading ? "KI analysiert…" : "Mit KI ausfüllen"}
              </button>
            </div>

            <LabeledField label="Website">
              <input
                type="url"
                value={website}
                onChange={(e) => handleWebsiteChange(e.target.value)}
                placeholder="https://…"
                className={fieldClass}
              />
            </LabeledField>

            <LabeledField label="Begrüssung">
              <textarea
                value={greeting}
                onChange={(e) => handleGreetingChange(e.target.value)}
                rows={3}
                className={textareaClass}
              />
            </LabeledField>

            <LabeledField label="Anweisungen">
              <textarea
                value={systemPrompt}
                onChange={(e) => handleSystemPromptChange(e.target.value)}
                rows={8}
                className={cn(textareaClass, "font-mono text-[13px]")}
              />
              <p className="text-[11px] text-[#99A0AE]">
                Max. {MAX_AGENT_INSTRUCTION_WORDS} Wörter ·{" "}
                {countInstructionWords(systemPrompt)} Wörter
              </p>
            </LabeledField>
          </AgentDetailSection>

          <AgentDetailSection title="Erweitert" subtitle="Compliance und Löschen">
            <ToggleRow
              label="EU-/DSGVO-konform"
              checked={euComplianceEnabled}
              onCheckedChange={handleComplianceToggle}
              ariaLabel="EU-/DSGVO-konform aktivieren"
            />

            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className={cn(
                landingBtnSecondary,
                "w-full justify-center text-[#525866] hover:bg-red-50 hover:text-red-600"
              )}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
              )}
              Assistent löschen
            </button>
          </AgentDetailSection>
        </div>
      </div>
    </div>
  );
}

export type { AgentWizardDraft };
