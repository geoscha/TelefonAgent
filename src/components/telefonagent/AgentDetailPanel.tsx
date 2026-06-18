"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Phone, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import type { AgentWizardDraft } from "@/components/telefonagent/AgentCreateWizard";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { Switch } from "@/components/ui/switch";
import {
  composeSystemPrompt,
  parseSystemPrompt,
  PROMPT_SECTION_FIELDS,
  type PromptSections,
} from "@/lib/elevenlabs/prompt-sections";
import type { StoredAgent } from "@/lib/onboarding-types";
import { cn } from "@/lib/utils";

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
  }
>;

interface AgentDetailPanelProps {
  agent: StoredAgent;
  isActive: boolean;
  voices: VoiceOption[];
  voicesLoading: boolean;
  deleting: boolean;
  saving?: boolean;
  saveError?: boolean;
  phoneNumbers?: Array<{ id: string; phoneNumber: string; label?: string }>;
  assigningPhone?: boolean;
  onAssignPhone?: (phoneNumberId: string) => void;
  onDelete: () => void;
  onActivate?: () => void;
  activating?: boolean;
  onUpdate: (patch: AgentDetailUpdate) => void | Promise<void>;
}

const fieldClass =
  "landing-body landing-radius-sm w-full border border-[#E1E4EA] bg-white px-3 py-2 text-[#0E121B] placeholder:text-[#99A0AE] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20";

const textareaClass = cn(fieldClass, "min-h-0 resize-y");

const AUTOSAVE_MS = 700;

export function AgentDetailPanel({
  agent,
  isActive,
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
  activating = false,
  onUpdate,
}: AgentDetailPanelProps) {
  const [name, setName] = useState(agent.name);
  const [greeting, setGreeting] = useState(agent.greeting);
  const [voiceId, setVoiceId] = useState(agent.voiceId);
  const [sections, setSections] = useState<PromptSections>(() =>
    parseSystemPrompt(agent.systemPrompt)
  );
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
    setSections(parseSystemPrompt(agent.systemPrompt));
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
  }

  function handleSectionChange(
    key: keyof PromptSections,
    value: string
  ) {
    setSections((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSave({ systemPrompt: composeSystemPrompt(next) });
      return next;
    });
  }

  function handleWebsiteChange(value: string) {
    setWebsite(value);
    scheduleSave({ website: value });
  }

  function handleBrancheChange(value: string) {
    setBranche(value);
    setSections((prev) => {
      const next = { ...prev, branche: value };
      scheduleSave({ systemPrompt: composeSystemPrompt(next) });
      return next;
    });
  }

  function handleZielChange(value: string) {
    setZiel(value);
    setSections((prev) => {
      const next = { ...prev, ziel: value };
      scheduleSave({ systemPrompt: composeSystemPrompt(next) });
      return next;
    });
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
      setSections(parsed);
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
    scheduleSave({ euComplianceEnabled: enabled });
  }

  const selectedPhoneId =
    agent.phoneNumberId ??
    (phoneNumbers.length === 1 ? phoneNumbers[0]?.id : "") ??
    "";

  const visiblePromptFields = PROMPT_SECTION_FIELDS.filter(({ key }) => {
    if (key === "branche" || key === "ziel") return false;
    const core =
      key === "rolle" ||
      key === "leistungen" ||
      key === "typischeAnfragen" ||
      key === "gespraechsfuehrung" ||
      key === "eskalation" ||
      key === "abschluss" ||
      key === "sonstiges";
    return core || sections[key].trim().length > 0;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className={cn(userPanelClass, "p-5 sm:p-6")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                aria-label="Agent-Name"
                className={cn(fieldClass, "text-[18px] font-medium")}
              />
              {(saving || saveError) && (
                <span className="shrink-0 text-[12px] text-[#99A0AE]">
                  {saving ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Speichert…
                    </span>
                  ) : (
                    "Speichern fehlgeschlagen"
                  )}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <label className={userLabelClass} htmlFor="agent-voice">
                Stimme
              </label>
              <select
                id="agent-voice"
                value={voiceId}
                disabled={voicesLoading}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className={fieldClass}
              >
                {voices.length === 0 ? (
                  <option value={voiceId}>
                    {agent.voiceName ?? "Stimme wählen"}
                  </option>
                ) : (
                  voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Agent löschen"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[#525866] hover:bg-red-50 hover:text-red-600"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
            )}
          </button>
        </div>

        {phoneNumbers.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <label className={userLabelClass} htmlFor="agent-phone">
              Telefonnummer
            </label>
            <select
              id="agent-phone"
              value={selectedPhoneId}
              disabled={assigningPhone || !onAssignPhone}
              onChange={(e) => {
                const nextId = e.target.value;
                if (nextId) onAssignPhone?.(nextId);
              }}
              className={fieldClass}
            >
              {phoneNumbers.length > 1 && (
                <option value="">Nummer wählen…</option>
              )}
              {phoneNumbers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.phoneNumber}
                  {p.label ? ` · ${p.label}` : ""}
                </option>
              ))}
            </select>
            {assigningPhone && (
              <p className="text-[11px] text-[#525866]">Wird zugewiesen…</p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-start justify-between gap-4 rounded border border-[#E1E4EA] bg-[#F5F7FA] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#0E121B]">
              EU-/DSGVO-/DSG-konform
            </p>
            <p className={`${userLabelClass} mt-1`}>
              Der Agent informiert Anrufer zu Beginn über KI, Aufzeichnung und
              Datenschutzrechte (EU, Deutschland, Schweiz).
            </p>
          </div>
          <Switch
            checked={euComplianceEnabled}
            onCheckedChange={handleComplianceToggle}
            aria-label="EU-/DSGVO-/DSG-konform aktivieren"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="Demnächst verfügbar"
            className={cn(
              landingBtnSecondary,
              "cursor-not-allowed opacity-60"
            )}
          >
            <Phone className="h-3.5 w-3.5 stroke-[1.75]" />
            Web-Anruf testen
          </button>
          {!isActive && onActivate && (
            <button
              type="button"
              onClick={onActivate}
              disabled={activating}
              className={landingBtnPrimary}
            >
              {activating ? "Aktivieren…" : "Als aktiv setzen"}
            </button>
          )}
        </div>
      </div>

      <div className={cn(userPanelClass, "p-5 sm:p-6")}>
        <h3 className={userTitleClass}>KI-Konfiguration</h3>
        <p className={`${userLabelClass} mt-1`}>
          Website und Branche helfen der KI, Name, Begrüssung und Anweisungen
          passend auszufüllen.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className={userLabelClass}>Website (optional)</span>
            <input
              type="url"
              value={website}
              onChange={(e) => handleWebsiteChange(e.target.value)}
              placeholder="https://ihre-firma.ch"
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={userLabelClass}>Branche</span>
            <input
              value={branche}
              onChange={(e) => handleBrancheChange(e.target.value)}
              placeholder="z. B. Immobilienverwaltung"
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={userLabelClass}>Ziel des Agenten</span>
            <textarea
              value={ziel}
              onChange={(e) => handleZielChange(e.target.value)}
              rows={2}
              placeholder="z. B. Schadenmeldungen aufnehmen und Termine koordinieren"
              className={textareaClass}
            />
          </label>
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
        </div>
      </div>

      <div className={cn(userPanelClass, "p-5 sm:p-6")}>
        <h3 className={userTitleClass}>Begrüssung</h3>
        <p className={`${userLabelClass} mt-1`}>
          Erster Satz, den Anrufer hören.
        </p>
        <textarea
          value={greeting}
          onChange={(e) => handleGreetingChange(e.target.value)}
          rows={3}
          className={cn(textareaClass, "mt-4")}
          placeholder="Grüezi, Sie sprechen mit …"
        />
      </div>

      <div className={cn(userPanelClass, "p-5 sm:p-6")}>
        <h3 className={userTitleClass}>System-Prompt</h3>
        <p className={`${userLabelClass} mt-1`}>
          Anweisungen für die Gesprächsführung — Änderungen werden automatisch
          gespeichert.
        </p>
        <div className="mt-4 space-y-4">
          {visiblePromptFields.map(({ key, label, rows = 3 }) => (
            <label key={key} className="block space-y-1.5">
              <span className={userLabelClass}>{label}</span>
              <textarea
                value={sections[key]}
                onChange={(e) => handleSectionChange(key, e.target.value)}
                rows={rows}
                className={textareaClass}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { AgentWizardDraft };
