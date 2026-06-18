"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { AgentCreateWizard, type AgentWizardDraft } from "@/components/telefonagent/AgentCreateWizard";
import {
  AgentDetailPanel,
  type AgentDetailUpdate,
} from "@/components/telefonagent/AgentDetailPanel";
import { RetellAgentSidebar } from "@/components/telefonagent/RetellAgentSidebar";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import { normalizeAgentLanguage } from "@/lib/elevenlabs/agent-config";
import type { OnboardingPhase, StoredAgent } from "@/lib/onboarding-types";
import { mockAgentConfig } from "@/lib/mock/agent";

type ForwardingType = "alle" | "bedingt";
type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";
type CalendarProviderId = "google" | "microsoft" | "apple";

interface Settings {
  connected: boolean;
  workspaceInfo?: string;
  agentId?: string;
  agentName?: string;
  voiceId?: string;
  voiceName?: string;
  language?: string;
  greeting?: string;
  systemPrompt?: string;
  customerNumber?: string;
  customerNumberLabel?: string;
  forwardingType?: ForwardingType;
  forwardingStatus?: ForwardingStatus;
  forwardingActivatedAt?: string;
  appointmentBookingEnabled?: boolean;
  appointmentProvider?: CalendarProviderId;
  curaForwardingNumber?: string;
  lastSync?: string;
  onboardingPhase?: OnboardingPhase;
  forwardingInstructions?: string;
  agents?: StoredAgent[];
}

interface Capabilities {
  hasApiKey: boolean;
  enrichmentEnabled: boolean;
  forwardingNumber: string | null;
  defaultSystemPrompt: string;
}

interface Voice {
  id: string;
  name: string;
  language: string;
  swissGerman?: boolean;
}

interface LanguageOption {
  value: string;
  label: string;
  available: boolean;
}

const DEFAULT_LANGUAGES: LanguageOption[] = [
  { value: "Deutsch", label: "Deutsch", available: true },
  { value: "Schweizerdeutsch", label: "Schweizerdeutsch", available: true },
];

export default function TelefonagentPage() {
  const setupDemo = useSetupDemoOptional();
  const [settings, setSettings] = useState<Settings>({ connected: false });
  const [caps, setCaps] = useState<Capabilities>({
    hasApiKey: false,
    enrichmentEnabled: false,
    forwardingNumber: null,
    defaultSystemPrompt: "",
  });
  const [statusLoading, setStatusLoading] = useState(true);
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase>("nummer_anfragen");

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  const [name, setName] = useState(mockAgentConfig.name);
  const [voiceId, setVoiceId] = useState("");
  const [language, setLanguage] = useState("Deutsch");
  const [greeting, setGreeting] = useState(mockAgentConfig.greeting);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savingAgent, setSavingAgent] = useState(false);

  const [storedAgents, setStoredAgents] = useState<StoredAgent[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<
    Array<{ id: string; phoneNumber: string; label?: string }>
  >([]);
  const [assigningPhone, setAssigningPhone] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [createNewAgent, setCreateNewAgent] = useState(false);
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [activatingAgentId, setActivatingAgentId] = useState<string | null>(null);
  const [autoSavingAgent, setAutoSavingAgent] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState(false);
  const elSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingElSyncRef = useRef<
    (AgentWizardDraft & { agentId: string }) | null
  >(null);

  const applySettings = useCallback((s: Settings) => {
    setSettings(s);
    if (s.onboardingPhase) setOnboardingPhase(s.onboardingPhase);
    if (s.agentName) setName(s.agentName);
    if (s.voiceId) setVoiceId(s.voiceId);
    if (s.language) setLanguage(normalizeAgentLanguage(s.language));
    if (s.greeting) setGreeting(s.greeting);
    if (s.systemPrompt) setSystemPrompt(s.systemPrompt);
    if (s.agents?.length) {
      setStoredAgents(s.agents);
      if (s.agentId) setSelectedAgentId(s.agentId);
    } else if (s.agentId && s.agentName && s.voiceId && s.greeting && s.systemPrompt) {
      setStoredAgents([
        {
          id: s.agentId,
          name: s.agentName,
          voiceId: s.voiceId,
          voiceName: s.voiceName,
          language: s.language ?? "Deutsch",
          greeting: s.greeting,
          systemPrompt: s.systemPrompt,
        },
      ]);
      setSelectedAgentId(s.agentId);
    } else if (s.agentId) {
      setSelectedAgentId(s.agentId);
    }
  }, []);

  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const res = await fetch("/api/elevenlabs/voices");
      const data = await res.json();
      if (res.ok && data.ok) {
        const loadedVoices = data.voices as Voice[];
        const langs = (data.languages as LanguageOption[] | undefined)?.length
          ? (data.languages as LanguageOption[])
          : DEFAULT_LANGUAGES;
        setVoices(loadedVoices);
        setVoiceId((prev) => {
          if (prev && loadedVoices.some((v) => v.id === prev)) return prev;
          return loadedVoices[0]?.id ?? "";
        });
        setLanguage((prev) => {
          const normalized = normalizeAgentLanguage(prev);
          if (langs.some((l) => l.value === normalized && l.available)) {
            return normalized;
          }
          return "Deutsch";
        });
      }
    } catch {
      /* non-fatal */
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  const autoConnect = useCallback(async () => {
    try {
      const res = await fetch("/api/elevenlabs/connect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        applySettings(data.settings as Settings);
      }
    } catch {
      /* non-fatal */
    }
  }, [applySettings]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/phone/onboarding");
        const data = await res.json();
        if (res.ok && data.ok) {
          const capabilities = data.capabilities as Capabilities;
          const s = data.settings as Settings;
          setCaps(capabilities);
          applySettings(s);
          setOnboardingPhase(data.phase as OnboardingPhase);
          setSystemPrompt(s.systemPrompt || capabilities.defaultSystemPrompt);
          setPhoneNumbers(
            ((data.numbers as Array<{ id: string; phoneNumber: string; label?: string }>) ??
              []
            ).map((n) => ({
              id: n.id,
              phoneNumber: n.phoneNumber,
              label: n.label,
            }))
          );

          const connectRes = await fetch("/api/elevenlabs/connect");
          const connectData = await connectRes.json();
          if (connectRes.ok && connectData.ok) {
            applySettings(connectData.settings as Settings);
            if (connectData.settings.connected) loadVoices();
          } else if (capabilities.hasApiKey && !s.connected) {
            await autoConnect();
          } else if (s.connected) {
            loadVoices();
          }
        }
      } finally {
        setStatusLoading(false);
      }
    })();
  }, [applySettings, autoConnect, loadVoices]);

  useEffect(() => {
    if (onboardingPhase !== "nummer_warte") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/phone/onboarding");
        const data = await res.json();
        if (res.ok && data.ok) {
          setOnboardingPhase(data.phase as OnboardingPhase);
          applySettings(data.settings as Settings);
        }
      } catch {
        /* keep polling */
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [onboardingPhase, applySettings]);

  useEffect(() => {
    if (
      onboardingPhase === "agent" &&
      storedAgents.length === 0 &&
      !createWizardOpen &&
      detailAgentId === null
    ) {
      setCreateWizardOpen(true);
      if (caps.hasApiKey && !settings.connected) {
        autoConnect().then(() => loadVoices());
      } else {
        loadVoices();
      }
    }
  }, [
    onboardingPhase,
    storedAgents.length,
    createWizardOpen,
    detailAgentId,
    caps.hasApiKey,
    settings.connected,
    autoConnect,
    loadVoices,
  ]);

  useEffect(() => {
    if (settings.connected) loadVoices();
  }, [settings.connected, loadVoices]);

  async function handleSaveAgent(
    override?: AgentWizardDraft & {
      agentId?: string;
      createNew?: boolean;
      euComplianceEnabled?: boolean;
    },
    options?: { silent?: boolean }
  ) {
    const saveName = override?.name ?? name;
    const saveVoiceId = override?.voiceId ?? voiceId;
    const saveLanguage = override
      ? normalizeAgentLanguage(override.language)
      : language;
    const saveGreeting = override?.greeting ?? greeting;
    const saveSystemPrompt = override?.systemPrompt ?? systemPrompt;
    const saveComplianceEnabled =
      override?.euComplianceEnabled ??
      storedAgents.find((a) => a.id === (override?.agentId ?? selectedAgentId))
        ?.euComplianceEnabled ??
      false;
    const isNew =
      override?.createNew ??
      (override?.agentId ? false : createNewAgent || !selectedAgentId);
    const saveAgentId = override?.agentId ?? (isNew ? undefined : selectedAgentId);

    let connected = settings.connected;
    if (!connected) {
      try {
        const res = await fetch("/api/elevenlabs/connect", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.ok) {
          applySettings(data.settings as Settings);
          connected = (data.settings as Settings).connected;
        }
      } catch {
        /* fall through */
      }
    }
    if (!connected) {
      if (!options?.silent) {
        toast.error("Verbindung konnte nicht hergestellt werden.");
      }
      return false;
    }
    if (!saveVoiceId) {
      if (!options?.silent) {
        toast.error("Bitte eine Stimme auswählen.");
      }
      return false;
    }
    setSavingAgent(true);
    try {
      const res = await fetch("/api/elevenlabs/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
          voiceId: saveVoiceId,
          voiceName:
            override?.voiceName ??
            voices.find((v) => v.id === saveVoiceId)?.name,
          language: saveLanguage,
          greeting: saveGreeting,
          systemPrompt: saveSystemPrompt,
          euComplianceEnabled: saveComplianceEnabled,
          agentId: isNew ? undefined : saveAgentId || undefined,
          createNew: isNew,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        applySettings(data.settings as Settings);
        if (data.agents) setStoredAgents(data.agents as StoredAgent[]);
        if (data.agentId) {
          setSelectedAgentId(data.agentId as string);
          setCreateNewAgent(false);
        }
        if (data.settings?.onboardingPhase === "fertig") {
          setOnboardingPhase("fertig");
        }
        if (isNew && setupDemo?.active && setupDemo.step === "agent") {
          await setupDemo.completeAgentStep();
        }
        if (!options?.silent) {
          toast.success(isNew ? "Agent erstellt" : "Agent aktualisiert");
        }
        return true;
      }
      if (!options?.silent) {
        toast.error("Speichern fehlgeschlagen", { description: data.error });
      }
      return false;
    } catch {
      if (!options?.silent) {
        toast.error("Netzwerkfehler beim Speichern");
      }
      return false;
    } finally {
      setSavingAgent(false);
    }
  }

  function handleSelectAgent(agentId: string) {
    setDetailAgentId(agentId);
    if (settings.connected || caps.hasApiKey) loadVoices();
  }

  const queueElevenLabsSync = useCallback(
    (draft: AgentWizardDraft & { agentId: string }) => {
      pendingElSyncRef.current = draft;
      if (elSyncTimerRef.current) clearTimeout(elSyncTimerRef.current);
      elSyncTimerRef.current = setTimeout(() => {
        const pending = pendingElSyncRef.current;
        if (!pending) return;
        void handleSaveAgent(
          { ...pending, createNew: false },
          { silent: true }
        );
      }, 2500);
    },
    // handleSaveAgent is stable enough for debounced background sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.connected, voices]
  );

  useEffect(() => {
    return () => {
      if (elSyncTimerRef.current) clearTimeout(elSyncTimerRef.current);
    };
  }, []);

  async function handleAgentAutoSave(agentId: string, patch: AgentDetailUpdate) {
    const agent = storedAgents.find((a) => a.id === agentId);
    if (!agent) return;

    const draft = {
      name: patch.name ?? agent.name,
      voiceId: patch.voiceId ?? agent.voiceId,
      voiceName: patch.voiceName ?? agent.voiceName,
      language: patch.language ?? agent.language,
      greeting: patch.greeting ?? agent.greeting,
      systemPrompt: patch.systemPrompt ?? agent.systemPrompt,
      euComplianceEnabled:
        patch.euComplianceEnabled ?? agent.euComplianceEnabled ?? false,
      website: patch.website ?? agent.website ?? "",
    };

    if (!draft.name.trim() || !draft.greeting.trim() || !draft.voiceId) {
      return;
    }

    setAutoSavingAgent(true);
    setAutoSaveError(false);
    try {
      const res = await fetch("/api/elevenlabs/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          agentId,
          createNew: false,
          persistOnly: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.settings) applySettings(data.settings as Settings);
        if (data.agents) setStoredAgents(data.agents as StoredAgent[]);
        if (settings.connected || caps.hasApiKey) {
          queueElevenLabsSync({ ...draft, agentId });
        }
      } else {
        setAutoSaveError(true);
      }
    } catch {
      setAutoSaveError(true);
    } finally {
      setAutoSavingAgent(false);
    }
  }

  async function handleWizardSave(draft: AgentWizardDraft) {
    const ok = await handleSaveAgent({ ...draft, createNew: true });
    if (ok) setCreateWizardOpen(false);
  }

  function handleCreateNewAgent() {
    setCreateWizardOpen(true);
    if (settings.connected || caps.hasApiKey) loadVoices();
  }

  async function handleActivateAgent(agentId: string) {
    if (settings.agentId === agentId) return;
    const agent = storedAgents.find((a) => a.id === agentId);
    if (!agent) return;

    const previousAgentId = settings.agentId;
    setSettings((s) => ({ ...s, agentId }));
    setActivatingAgentId(agentId);
    try {
      const res = await fetch("/api/elevenlabs/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...agent,
          agentId: agent.id,
          createNew: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        applySettings(data.settings as Settings);
        if (data.agents) {
          const incoming = data.agents as StoredAgent[];
          setStoredAgents((prev) => {
            const byId = new Map(incoming.map((a) => [a.id, a]));
            const kept = prev.map((a) => byId.get(a.id) ?? a);
            const extra = incoming.filter(
              (a) => !prev.some((p) => p.id === a.id)
            );
            return [...kept, ...extra];
          });
        }
        setSelectedAgentId(agentId);
      } else {
        setSettings((s) => ({ ...s, agentId: previousAgentId }));
        toast.error("Aktivieren fehlgeschlagen", { description: data.error });
      }
    } catch {
      setSettings((s) => ({ ...s, agentId: previousAgentId }));
      toast.error("Netzwerkfehler");
    } finally {
      setActivatingAgentId(null);
    }
  }

  async function handleAssignPhone(agentId: string, phoneNumberId: string) {
    setAssigningPhone(true);
    try {
      const res = await fetch("/api/elevenlabs/agent/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, phoneNumberId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        applySettings(data.settings as Settings);
        if (data.agents) setStoredAgents(data.agents as StoredAgent[]);
        toast.success("Telefonnummer zugewiesen");
      } else {
        toast.error("Zuweisung fehlgeschlagen", { description: data.error });
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setAssigningPhone(false);
    }
  }

  async function handleDeleteAgent(agentId: string) {
    setDeletingAgentId(agentId);
    try {
      const res = await fetch(
        `/api/elevenlabs/agent/delete?id=${encodeURIComponent(agentId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        applySettings(data.settings as Settings);
        if (data.agents) setStoredAgents(data.agents as StoredAgent[]);
        if (detailAgentId === agentId) setDetailAgentId(null);
        toast.success("Agent gelöscht");
      } else {
        toast.error("Löschen fehlgeschlagen", { description: data.error });
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setDeletingAgentId(null);
    }
  }

  useEffect(() => {
    if (storedAgents.length > 0 && detailAgentId === null) {
      const preferred = settings.agentId ?? storedAgents[0]?.id;
      if (preferred) {
        setDetailAgentId(preferred);
      }
    }
  }, [storedAgents, detailAgentId, settings.agentId]);

  useEffect(() => {
    if (!detailAgentId || phoneNumbers.length !== 1) return;
    const agent = storedAgents.find((a) => a.id === detailAgentId);
    if (!agent?.phoneNumberId) {
      void handleAssignPhone(detailAgentId, phoneNumbers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailAgentId, phoneNumbers.length, storedAgents]);

  const detailAgent =
    storedAgents.find((a) => a.id === detailAgentId) ?? null;

  return (
    <>
      <QuotaGate>
        <div className="flex min-h-[560px] gap-3">
          <RetellAgentSidebar
            agents={storedAgents}
            selectedAgentId={detailAgentId ?? selectedAgentId}
            activeAgentId={settings.agentId}
            onSelect={handleSelectAgent}
            onCreateNew={handleCreateNewAgent}
          />
          {statusLoading ? (
            <Skeleton className="h-[560px] flex-1 rounded" />
          ) : detailAgent ? (
            <AgentDetailPanel
              agent={detailAgent}
              isActive={settings.agentId === detailAgent.id}
              voices={voices}
              voicesLoading={voicesLoading}
              deleting={deletingAgentId === detailAgent.id}
              saving={autoSavingAgent}
              saveError={autoSaveError}
              phoneNumbers={phoneNumbers}
              assigningPhone={assigningPhone}
              onAssignPhone={(phoneNumberId) =>
                void handleAssignPhone(detailAgent.id, phoneNumberId)
              }
              onDelete={() => void handleDeleteAgent(detailAgent.id)}
              onActivate={() => void handleActivateAgent(detailAgent.id)}
              activating={activatingAgentId === detailAgent.id}
              onUpdate={(patch) => void handleAgentAutoSave(detailAgent.id, patch)}
            />
          ) : (
            <div className="landing-panel flex flex-1 items-center justify-center border border-dashed border-[#E1E4EA] p-8">
              <p className="landing-body text-[#99A0AE]">
                Agent auswählen oder neuen Agent hinzufügen
              </p>
            </div>
          )}
        </div>
      </QuotaGate>

      <AgentCreateWizard
        open={createWizardOpen}
        onClose={() => setCreateWizardOpen(false)}
        voices={voices}
        voicesLoading={voicesLoading}
        saving={savingAgent}
        onSave={handleWizardSave}
      />
    </>
  );
}
