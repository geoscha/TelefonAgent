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
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import { normalizeAgentLanguage } from "@/lib/elevenlabs/agent-config";
import type { OnboardingPhase, StoredAgent } from "@/lib/onboarding-types";
import { sessionThrottle, readStaleCache, writeStaleCache } from "@/lib/client/stale-cache";
import { useWorkspace } from "@/lib/hooks/useWorkspace";
import {
  SETUP_DEMO_SKIP_EVENT,
} from "@/lib/setup-demo-events";
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
  const { data: workspace, loading: workspaceLoading, revalidate: revalidateWorkspace } =
    useWorkspace();
  const statusLoading = workspaceLoading && workspace === null;
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
    Array<{
      id: string;
      phoneNumber: string;
      label?: string;
      customerNumber?: string;
      source?: "pool" | "sip_trunk";
      forwardingStatus?: string;
      isPrimary?: boolean;
    }>
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
    const cached = readStaleCache<Voice[]>("voices", 10 * 60_000);
    if (cached?.length) {
      setVoices(cached);
      setVoiceId((prev) => {
        if (prev && cached.some((v) => v.id === prev)) return prev;
        return cached[0]?.id ?? "";
      });
    }

    setVoicesLoading(!cached?.length);
    try {
      const res = await fetch("/api/elevenlabs/voices");
      const data = await res.json();
      if (res.ok && data.ok) {
        const loadedVoices = data.voices as Voice[];
        writeStaleCache("voices", loadedVoices);
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
    if (!workspace) return;

    const capabilities = workspace.capabilities;
    const s = workspace.settings as Settings;
    setCaps(capabilities);
    applySettings(s);
    setOnboardingPhase(workspace.phase);
    setSystemPrompt(s.systemPrompt || capabilities.defaultSystemPrompt);
    setPhoneNumbers(
      workspace.numbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        label: n.label,
        customerNumber: n.customerNumber,
        source: n.source,
        forwardingStatus: n.forwardingStatus,
        isPrimary: n.isPrimary,
      }))
    );

    if (s.connected) {
      loadVoices();
    } else if (capabilities.hasApiKey) {
      void autoConnect();
    }

    if (sessionThrottle("connect-reconcile", 5 * 60_000)) {
      void fetch("/api/elevenlabs/connect?reconcile=1")
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) applySettings(data.settings as Settings);
        })
        .catch(() => {});
    }
  }, [workspace, applySettings, autoConnect, loadVoices]);

  useEffect(() => {
    if (onboardingPhase !== "nummer_warte") return;
    const interval = setInterval(() => {
      void revalidateWorkspace().catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [onboardingPhase, revalidateWorkspace]);

  const handleCloseCreateWizard = useCallback(() => {
    setCreateWizardOpen(false);
    setDetailAgentId((current) => {
      if (current) return current;
      const preferred = settings.agentId ?? storedAgents[0]?.id;
      return preferred ?? null;
    });
    if (setupDemo?.active && setupDemo.step === "agent") {
      void setupDemo.skip();
    }
  }, [setupDemo, settings.agentId, storedAgents]);

  useEffect(() => {
    function onDemoSkipped() {
      setCreateWizardOpen(false);
    }

    window.addEventListener(SETUP_DEMO_SKIP_EVENT, onDemoSkipped);
    return () => window.removeEventListener(SETUP_DEMO_SKIP_EVENT, onDemoSkipped);
  }, []);

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
          website:
            override?.website?.trim() ||
            storedAgents.find((a) => a.id === (override?.agentId ?? selectedAgentId))
              ?.website ||
            undefined,
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
      escalationPhoneNumber:
        patch.escalationPhoneNumber ?? agent.escalationPhoneNumber ?? "",
      medicalGuardrailsEnabled:
        patch.medicalGuardrailsEnabled ?? agent.medicalGuardrailsEnabled,
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
          if (
            patch.euComplianceEnabled !== undefined ||
            patch.escalationPhoneNumber !== undefined ||
            patch.medicalGuardrailsEnabled !== undefined
          ) {
            void handleSaveAgent(
              { ...draft, agentId, createNew: false },
              { silent: true }
            );
          } else {
            queueElevenLabsSync({ ...draft, agentId });
          }
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
    if (ok) {
      setCreateWizardOpen(false);
    }
  }

  function handleCreateNewAgent() {
    setCreateWizardOpen(true);
    setDetailAgentId(null);
    if (settings.connected || caps.hasApiKey) loadVoices();
  }

  async function handleDeactivateAgent() {
    const previousAgentId = settings.agentId;
    if (!previousAgentId) return;

    setSettings((s) => ({ ...s, agentId: undefined }));
    setActivatingAgentId(previousAgentId);
    try {
      const res = await fetch("/api/elevenlabs/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivate: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        applySettings(data.settings as Settings);
        if (data.agents) setStoredAgents(data.agents as StoredAgent[]);
        void revalidateWorkspace().catch(() => {});
      } else {
        setSettings((s) => ({ ...s, agentId: previousAgentId }));
        toast.error("Deaktivieren fehlgeschlagen", { description: data.error });
      }
    } catch {
      setSettings((s) => ({ ...s, agentId: previousAgentId }));
      toast.error("Netzwerkfehler");
    } finally {
      setActivatingAgentId(null);
    }
  }

  async function handleActivateAgent(agentId: string) {
    if (settings.agentId === agentId) return;
    const agent = storedAgents.find((a) => a.id === agentId);
    if (!agent) return;

    if (phoneNumbers.length === 0) {
      toast.error("Keine Telefonnummer", {
        description:
          "Richten Sie zuerst eine Nummer unter Telefonnummern ein, bevor Sie einen Agenten aktivieren.",
      });
      return;
    }

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
          activate: true,
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
        void revalidateWorkspace().catch(() => {});
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
      <div className="flex min-h-[calc(100dvh-3.5rem-2rem)] gap-3 sm:min-h-[calc(100dvh-3.5rem-2.5rem)] lg:min-h-[calc(100dvh-3.5rem-3rem)]">
          <RetellAgentSidebar
            agents={storedAgents}
            selectedAgentId={detailAgentId ?? selectedAgentId}
            activeAgentId={settings.agentId}
            onSelect={handleSelectAgent}
            onCreateNew={handleCreateNewAgent}
          />
          {statusLoading ? (
            <Skeleton className="min-h-0 flex-1 self-stretch rounded" />
          ) : createWizardOpen ? (
            <AgentCreateWizard
              onClose={handleCloseCreateWizard}
              voices={voices}
              voicesLoading={voicesLoading}
              saving={savingAgent}
              onSave={handleWizardSave}
            />
          ) : detailAgent ? (
            <AgentDetailPanel
              agent={detailAgent}
              isActive={settings.agentId === detailAgent.id}
              curaNumber={
                settings.curaForwardingNumber ?? caps.forwardingNumber ?? undefined
              }
              customerNumber={settings.customerNumber}
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
              onDeactivate={() => void handleDeactivateAgent()}
              activating={activatingAgentId === detailAgent.id}
              onUpdate={(patch) => void handleAgentAutoSave(detailAgent.id, patch)}
              onAgentsChange={(agents) => setStoredAgents(agents)}
            />
          ) : (
            <div className="landing-panel flex flex-1 items-center justify-center self-stretch border border-dashed border-[#E1E4EA] p-8">
              <p className="landing-body text-[#99A0AE]">
                Agent auswählen oder neuen Agent hinzufügen
              </p>
            </div>
          )}
        </div>
    </>
  );
}
