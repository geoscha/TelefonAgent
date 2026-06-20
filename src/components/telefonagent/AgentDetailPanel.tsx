"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import type { AgentWizardDraft } from "@/components/telefonagent/AgentCreateWizard";
import { AgentIntegrationsSection } from "@/components/telefonagent/AgentIntegrationsSection";
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
  formatGreetingPreviewCostLabel,
} from "@/lib/billing/quota-display";
import { applyEuComplianceGreeting } from "@/lib/elevenlabs/compliance";
import {
  composeSystemPrompt,
  countInstructionWords,
  MAX_AGENT_INSTRUCTION_WORDS,
  parseSystemPrompt,
} from "@/lib/elevenlabs/prompt-sections";
import type { StoredAgent } from "@/lib/onboarding-types";
import { cn } from "@/lib/utils";
import { useVoicePreview } from "@/lib/hooks/useVoicePreview";
import { notifyTokenBalanceChanged } from "@/lib/hooks/useTokenBalance";

interface VoiceOption {
  id: string;
  name: string;
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
  curaNumber?: string;
  customerNumber?: string;
  voices: VoiceOption[];
  voicesLoading: boolean;
  deleting: boolean;
  saving?: boolean;
  saveError?: boolean;
  phoneNumbers?: AgentPhoneNumber[];
  assigningPhone?: boolean;
  onAssignPhone?: (phoneNumberId: string) => void;
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
  agentPhoneNumberId?: string,
  curaNumber?: string
): string | null {
  const assigned =
    phoneNumbers.find((p) => p.id === agentPhoneNumberId) ??
    phoneNumbers.find((p) => p.isPrimary) ??
    phoneNumbers[0];

  return assigned?.phoneNumber ?? curaNumber?.trim() ?? null;
}

function AgentReachability({
  isActive,
  curaNumber,
  customerNumber,
  phoneNumbers,
  agentPhoneNumberId,
}: {
  isActive: boolean;
  curaNumber?: string;
  customerNumber?: string;
  phoneNumbers: AgentPhoneNumber[];
  agentPhoneNumberId?: string;
}) {
  if (!isActive) {
    return (
      <p className="text-[12px] text-[#99A0AE]">
        Agent ist inaktiv und nimmt keine Anrufe entgegen.
      </p>
    );
  }

  const assignedPhone =
    phoneNumbers.find((p) => p.id === agentPhoneNumberId) ??
    phoneNumbers.find((p) => p.isPrimary) ??
    phoneNumbers[0];

  const connectedSip = phoneNumbers.filter(
    (p) =>
      p.source === "sip_trunk" &&
      (!agentPhoneNumberId || p.id === agentPhoneNumberId)
  );

  const lines: Array<{ label: string; number: string }> = [];

  if (curaNumber) {
    lines.push({ label: "Cura-Nummer", number: curaNumber });
  }

  for (const sip of connectedSip) {
    if (!lines.some((line) => line.number === sip.phoneNumber)) {
      lines.push({
        label: sip.label?.trim() || "Verbundene Nummer",
        number: sip.phoneNumber,
      });
    }
  }

  const forwardedFrom =
    assignedPhone?.customerNumber?.trim() || customerNumber?.trim();
  if (
    forwardedFrom &&
    assignedPhone?.forwardingStatus === "aktiv" &&
    !lines.some((line) => line.number === forwardedFrom)
  ) {
    lines.push({ label: "Ihre Nummer", number: forwardedFrom });
  }

  if (lines.length === 0) {
    return (
      <p className="text-[12px] text-[#99A0AE]">
        Noch keine Telefonnummer verbunden. Richten Sie eine Nummer unter
        Telefonnummern ein.
      </p>
    );
  }

  return (
    <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#99A0AE]">
        Erreichbar unter
      </p>
      <ul className="mt-1.5 space-y-1">
        {lines.map((line) => (
          <li
            key={`${line.label}-${line.number}`}
            className="flex items-baseline justify-between gap-3 text-[13px]"
          >
            <span className="text-[#525866]">{line.label}</span>
            <span className="font-mono text-[#0E121B]">{line.number}</span>
          </li>
        ))}
      </ul>
    </div>
  );
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
  curaNumber,
  customerNumber,
  voices,
  voicesLoading,
  deleting,
  saving = false,
  saveError = false,
  phoneNumbers = [],
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
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [euComplianceEnabled, setEuComplianceEnabled] = useState(
    Boolean(agent.euComplianceEnabled)
  );
  const [website, setWebsite] = useState(agent.website ?? "");
  const [branche, setBranche] = useState(
    () => parseSystemPrompt(agent.systemPrompt).branche
  );
  const [ziel, setZiel] = useState(
    () => parseSystemPrompt(agent.systemPrompt).ziel
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [usageSeconds, setUsageSeconds] = useState<number | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [greetingPreviewLoading, setGreetingPreviewLoading] = useState(false);
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
    setSystemPrompt(agent.systemPrompt);
    setEuComplianceEnabled(Boolean(agent.euComplianceEnabled));
    setWebsite(agent.website ?? "");
    const parsed = parseSystemPrompt(agent.systemPrompt);
    setBranche(parsed.branche);
    setZiel(parsed.ziel);
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
    scheduleSave({ name: value });
  }

  function handleGreetingChange(value: string) {
    setGreeting(value);
    scheduleSave({ greeting: value });
  }

  function handleVoiceChange(nextVoiceId: string) {
    const picked = voices.find((v) => v.id === nextVoiceId);
    setVoiceId(nextVoiceId);
    scheduleSave({
      voiceId: nextVoiceId,
      voiceName: picked?.name,
      language: picked?.language ?? agent.language,
    });
    if (picked) {
      void previewVoice(picked.id, picked.name, picked.language ?? agent.language);
    }
  }

  function handleSystemPromptChange(value: string) {
    setSystemPrompt(value);
    const parsed = parseSystemPrompt(value);
    setBranche(parsed.branche);
    setZiel(parsed.ziel);
    scheduleSave({ systemPrompt: value });
  }

  function handleWebsiteChange(value: string) {
    setWebsite(value);
    scheduleSave({ website: value });
  }

  function handleBrancheChange(value: string) {
    setBranche(value);
    patchSystemPrompt({ branche: value });
  }

  function handleZielChange(value: string) {
    setZiel(value);
    patchSystemPrompt({ ziel: value });
  }

  async function handleAiFill() {
    const industry = branche.trim() || name.trim();
    if (!industry) {
      toast.error("Bitte zuerst eine Branche angeben.");
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch("/api/elevenlabs/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry,
          website: website.trim() || undefined,
          goal:
            ziel.trim() ||
            "Anrufe professionell entgegennehmen, Anliegen aufnehmen und bei Bedarf weiterleiten.",
          gender: "female",
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
      setBranche(parsed.branche);
      setZiel(parsed.ziel);

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

  const canActivateAgent = phoneNumbers.length > 0;

  function handleActiveToggle(active: boolean) {
    if (activating) return;
    if (active) {
      if (!canActivateAgent) {
        toast.error("Keine Telefonnummer", {
          description:
            "Richten Sie zuerst eine Nummer unter Telefonnummern ein, bevor Sie den Agenten aktivieren.",
        });
        return;
      }
      onActivate?.();
    } else {
      onDeactivate?.();
    }
  }

  async function handlePreviewGreeting() {
    const text = greeting.trim();
    if (!voiceId || !text) {
      toast.error("Bitte Begrüssung und Stimme angeben.");
      return;
    }

    const picked = voices.find((v) => v.id === voiceId);
    const spokenGreeting = applyEuComplianceGreeting(text, euComplianceEnabled);

    setGreetingPreviewLoading(true);
    try {
      const result = await previewVoice(
        voiceId,
        picked?.name ?? agent.voiceName ?? "Stimme",
        picked?.language ?? agent.language,
        spokenGreeting
      );
      if (result.ok) {
        notifyTokenBalanceChanged();
      } else if (result.insufficientTokens) {
        toast.error("Nicht genügend Tokens", {
          description:
            result.error ??
            `Die Begrüssungsvorschau kostet ${formatGreetingPreviewCostLabel()}.`,
        });
      } else {
        toast.error("Begrüssung konnte nicht abgespielt werden.", {
          description: result.error,
        });
      }
    } finally {
      setGreetingPreviewLoading(false);
    }
  }

  const selectedPhoneId =
    agent.phoneNumberId ??
    (phoneNumbers.length === 1 ? phoneNumbers[0]?.id : "") ??
    "";

  const primaryAgentNumber = resolvePrimaryAgentNumber(
    phoneNumbers,
    selectedPhoneId || agent.phoneNumberId,
    curaNumber
  );

  const voiceOptions =
    voices.length > 0
      ? voices
      : voiceId
        ? [{ id: voiceId, name: agent.voiceName ?? "Stimme", language: agent.language }]
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
                aria-label="Agentenname"
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
                  aria-label="Agent aktivieren oder deaktivieren"
                  disabled={activating || (!isActive && !canActivateAgent)}
                />
              </div>

              <div className="flex min-w-0 items-baseline gap-2 border-[#E1E4EA] sm:border-l sm:pl-4">
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#99A0AE]">
                  Erreichbar
                </span>
                <span
                  className={cn(
                    "truncate font-mono text-[15px] font-semibold tabular-nums sm:text-[16px]",
                    primaryAgentNumber ? "text-[#0E121B]" : "text-[#99A0AE]"
                  )}
                >
                  {primaryAgentNumber ?? "Keine Nummer"}
                </span>
              </div>
            </div>
          </div>

          {!canActivateAgent && !isActive && (
            <p className="mt-2 text-[12px] text-[#99A0AE]">
              Aktivierung erst möglich, wenn eine Telefonnummer hinterlegt ist.
            </p>
          )}

          <p className={cn(userStatClass, "mt-3")}>
            {usageLoading
              ? "…"
              : formatAgentUsageDuration(usageSeconds ?? 0)}
          </p>

          <button
            type="button"
            onClick={() => void handlePreviewGreeting()}
            disabled={greetingPreviewLoading || !voiceId || !greeting.trim()}
            className={cn(
              landingBtnSecondary,
              "mt-3 inline-flex w-full items-center justify-center gap-2"
            )}
          >
            {greetingPreviewLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 stroke-[1.75]" />
            )}
            Begrüssung anhören · {formatGreetingPreviewCostLabel()}
          </button>

          <AgentTestChat
            agentId={agent.id}
            agentName={name}
            disabled={!agent.id}
            draft={{
              greeting,
              systemPrompt,
              language: agent.language,
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
            title="Erreichbarkeit"
            subtitle={
              isActive
                ? "Weitere Leitungen und Weiterleitungen"
                : "Details zur Telefonnummer"
            }
          >
            <AgentReachability
              isActive={isActive}
              curaNumber={curaNumber}
              customerNumber={customerNumber}
              phoneNumbers={phoneNumbers}
              agentPhoneNumberId={agent.phoneNumberId}
            />
          </AgentDetailSection>

          <AgentDetailSection
            title="Konfiguration"
            subtitle="Stimme, Nummer und Website"
          >
            <LabeledField label="Stimme">
              <VoiceSelect
                voices={voiceOptions}
                value={voiceId}
                onChange={handleVoiceChange}
                loading={voicesLoading}
              />
            </LabeledField>

            {phoneNumbers.length > 0 && (
              <LabeledField label="Telefonnummer">
                {phoneNumbers.length === 1 ? (
                  <p className={cn(fieldClass, "bg-[#FAFAFA] text-[#525866]")}>
                    {phoneNumbers[0].phoneNumber}
                    {phoneNumbers[0].label ? ` · ${phoneNumbers[0].label}` : ""}
                  </p>
                ) : (
                  <select
                    value={selectedPhoneId}
                    disabled={assigningPhone || !onAssignPhone}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (nextId) onAssignPhone?.(nextId);
                    }}
                    className={fieldClass}
                  >
                    <option value="">Telefonnummer wählen…</option>
                    {phoneNumbers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.phoneNumber}
                        {p.label ? ` · ${p.label}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </LabeledField>
            )}

            <LabeledField label="Website">
              <input
                type="url"
                value={website}
                onChange={(e) => handleWebsiteChange(e.target.value)}
                placeholder="https://…"
                className={fieldClass}
              />
            </LabeledField>
          </AgentDetailSection>

          <AgentDetailSection
            title="Inhalte"
            subtitle="Branche, Begrüssung und Anweisungen"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="Branche">
                <input
                  value={branche}
                  onChange={(e) => handleBrancheChange(e.target.value)}
                  className={fieldClass}
                />
              </LabeledField>
              <LabeledField label="Ziel">
                <input
                  value={ziel}
                  onChange={(e) => handleZielChange(e.target.value)}
                  className={fieldClass}
                />
              </LabeledField>
            </div>

            <button
              type="button"
              onClick={() => void handleAiFill()}
              disabled={aiLoading || saving}
              className={cn(landingBtnPrimary, "inline-flex items-center gap-2")}
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {aiLoading ? "KI analysiert…" : "Mit KI ausfüllen"}
            </button>

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

          <AgentDetailSection
            title="Integrationen"
            subtitle="Kalender und weitere Anbindungen"
          >
            <AgentIntegrationsSection
              agent={agent}
              onAgentsChange={onAgentsChange}
            />
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
              Agent löschen
            </button>
          </AgentDetailSection>
        </div>
      </div>
    </div>
  );
}

export type { AgentWizardDraft };
