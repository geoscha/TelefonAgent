"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AgentCreateWizard, type AgentWizardDraft } from "@/components/telefonagent/AgentCreateWizard";
import { AgentDetailModal } from "@/components/telefonagent/AgentDetailModal";
import { AgentList } from "@/components/telefonagent/AgentList";
import { AgentStatusHero } from "@/components/telefonagent/AgentStatusHero";
import { CallVolumeChart } from "@/components/telefonagent/CallVolumeChart";
import { PhoneNumberWizard } from "@/components/telefonagent/PhoneNumberWizard";
import { CalendarIntegrations } from "@/components/integrations/CalendarIntegrations";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { normalizeAgentLanguage } from "@/lib/elevenlabs/agent-config";
import type { OnboardingPhase, StoredAgent } from "@/lib/onboarding-types";
import { mockAgentConfig } from "@/lib/mock/agent";

type ForwardingType = "alle" | "bedingt";
type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";

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

type CalendarProviderId = "google" | "microsoft" | "apple";

interface ConnectedCalendar {
  provider: CalendarProviderId;
  connected: boolean;
  accountLabel?: string;
}

const CALENDAR_LABELS: Record<CalendarProviderId, string> = {
  google: "Google Kalender",
  microsoft: "Microsoft Outlook",
  apple: "Apple Kalender (iCloud)",
};

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

  const [forwardingType, setForwardingType] =
    useState<ForwardingType>("bedingt");
  const [forwardingStatus, setForwardingStatus] =
    useState<ForwardingStatus>("nicht_eingerichtet");
  const [storedAgents, setStoredAgents] = useState<StoredAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [createNewAgent, setCreateNewAgent] = useState(false);
  const [requestingNumber, setRequestingNumber] = useState(false);
  const [confirmingForwarding, setConfirmingForwarding] = useState(false);
  const [disconnectingPhone, setDisconnectingPhone] = useState(false);
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view");
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [activatingAgentId, setActivatingAgentId] = useState<string | null>(null);

  const [calendars, setCalendars] = useState<ConnectedCalendar[]>([]);
  const [apptEnabled, setApptEnabled] = useState(false);
  const [apptProvider, setApptProvider] = useState<CalendarProviderId | "">("");
  const [savingAppt, setSavingAppt] = useState(false);

  const applySettings = useCallback((s: Settings) => {
    setSettings(s);
    if (s.onboardingPhase) setOnboardingPhase(s.onboardingPhase);
    if (s.agentName) setName(s.agentName);
    if (s.voiceId) setVoiceId(s.voiceId);
    if (s.language) setLanguage(normalizeAgentLanguage(s.language));
    if (s.greeting) setGreeting(s.greeting);
    if (s.systemPrompt) setSystemPrompt(s.systemPrompt);
    if (s.forwardingType) setForwardingType(s.forwardingType);
    if (s.forwardingStatus) setForwardingStatus(s.forwardingStatus);
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
    if (typeof s.appointmentBookingEnabled === "boolean")
      setApptEnabled(s.appointmentBookingEnabled);
    if (s.appointmentProvider) setApptProvider(s.appointmentProvider);
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/integrations/status");
        const data = await res.json();
        if (res.ok && data.ok) {
          const connected = (data.calendars as ConnectedCalendar[]).filter(
            (c) => c.connected
          );
          setCalendars(connected);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  async function handleSaveAgent(
    override?: AgentWizardDraft & { agentId?: string; createNew?: boolean }
  ) {
    const saveName = override?.name ?? name;
    const saveVoiceId = override?.voiceId ?? voiceId;
    const saveLanguage = override
      ? normalizeAgentLanguage(override.language)
      : language;
    const saveGreeting = override?.greeting ?? greeting;
    const saveSystemPrompt = override?.systemPrompt ?? systemPrompt;
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
      toast.error("Verbindung konnte nicht hergestellt werden.");
      return false;
    }
    if (!saveVoiceId) {
      toast.error("Bitte eine Stimme auswählen.");
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
        toast.success(isNew ? "Agent erstellt" : "Agent aktualisiert");
        return true;
      }
      toast.error("Speichern fehlgeschlagen", { description: data.error });
      return false;
    } catch {
      toast.error("Netzwerkfehler beim Speichern");
      return false;
    } finally {
      setSavingAgent(false);
    }
  }

  async function handleRequestNumber() {
    setRequestingNumber(true);
    try {
      const res = await fetch("/api/phone/request", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOnboardingPhase(data.phase as OnboardingPhase);
        applySettings(data.settings as Settings);
        toast.success(
          data.autoAssigned
            ? "Ihre Nummer wurde zugewiesen"
            : "Anfrage gesendet — Nummer folgt sobald verfügbar"
        );
      } else {
        toast.error("Anfrage fehlgeschlagen");
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setRequestingNumber(false);
    }
  }

  async function handleConfirmForwarding() {
    setConfirmingForwarding(true);
    try {
      const res = await fetch("/api/phone/confirm-forwarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forwardingType }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOnboardingPhase(data.phase as OnboardingPhase);
        applySettings(data.settings as Settings);
        if (storedAgents.length === 0) {
          setCreateWizardOpen(true);
        }
        toast.success("Weiterleitung bestätigt — richten Sie jetzt Ihren Agenten ein.");
        return true;
      }
      toast.error("Speichern fehlgeschlagen");
      return false;
    } catch {
      toast.error("Netzwerkfehler");
      return false;
    } finally {
      setConfirmingForwarding(false);
    }
  }

  async function handleDisconnectPhone() {
    setDisconnectingPhone(true);
    try {
      const res = await fetch("/api/phone/disconnect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOnboardingPhase(data.phase as OnboardingPhase);
        applySettings(data.settings as Settings);
        setForwardingStatus("nicht_eingerichtet");
        toast.success("Telefonnummer entkoppelt");
        return true;
      }
      toast.error("Entkoppeln fehlgeschlagen");
      return false;
    } catch {
      toast.error("Netzwerkfehler");
      return false;
    } finally {
      setDisconnectingPhone(false);
    }
  }

  function handleSelectAgent(agentId: string) {
    setDetailAgentId(agentId);
    setDetailMode("view");
    if (settings.connected || caps.hasApiKey) loadVoices();
  }

  function handleEditAgent(agentId: string) {
    setDetailAgentId(agentId);
    setDetailMode("edit");
    if (settings.connected || caps.hasApiKey) loadVoices();
  }

  async function handleDetailSave(draft: AgentWizardDraft) {
    if (!detailAgentId) return;
    const ok = await handleSaveAgent({
      ...draft,
      agentId: detailAgentId,
      createNew: false,
    });
    if (ok) setDetailMode("view");
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

  async function handleSaveAppointment() {
    if (apptEnabled && !apptProvider) {
      toast.error("Bitte einen verbundenen Kalender auswählen.");
      return;
    }
    setSavingAppt(true);
    try {
      const res = await fetch("/api/appointment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: apptEnabled,
          provider: apptEnabled ? apptProvider : null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.settings) applySettings(data.settings as Settings);
        toast.success(
          apptEnabled
            ? "Terminvereinbarung aktiviert"
            : "Terminvereinbarung deaktiviert"
        );
      } else {
        toast.error("Speichern fehlgeschlagen", { description: data.error });
      }
    } catch {
      toast.error("Netzwerkfehler beim Speichern");
    } finally {
      setSavingAppt(false);
    }
  }

  useEffect(() => {
    if (forwardingStatus === "aktiv") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/elevenlabs/connect");
        const data = await res.json();
        const s = data.settings as Settings;
        if (s.forwardingStatus === "aktiv") {
          setForwardingStatus("aktiv");
          setSettings(s);
          toast.success("Weiterleitung aktiv");
        }
      } catch {
        /* keep polling */
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [forwardingStatus]);

  const forwardingActive = forwardingStatus === "aktiv";
  const curaNumber =
    settings.curaForwardingNumber ?? caps.forwardingNumber ?? "";
  const showAgentSection =
    onboardingPhase === "agent" ||
    onboardingPhase === "fertig" ||
    storedAgents.length > 0;
  const detailAgent =
    storedAgents.find((a) => a.id === detailAgentId) ?? null;

  return (
    <>
      <div className="space-y-8">
        <CallVolumeChart />

        <QuotaGate>
          <div className="space-y-6">
            {forwardingActive && (
              <AgentStatusHero isLive phoneNumber={curaNumber || undefined} />
            )}

            {statusLoading ? (
              <Skeleton className="h-40 w-full rounded-[18px]" />
            ) : (
              showAgentSection && (
                <AgentList
                    agents={storedAgents}
                    activeAgentId={settings.agentId}
                    selectedAgentId={detailAgentId ?? selectedAgentId}
                    deletingId={deletingAgentId}
                    activatingId={activatingAgentId}
                    onActivate={handleActivateAgent}
                    onSelect={handleSelectAgent}
                    onEdit={handleEditAgent}
                    onCreateNew={handleCreateNewAgent}
                    onDelete={handleDeleteAgent}
                  />
              )
            )}

            <AgentCreateWizard
              open={createWizardOpen}
              onClose={() => setCreateWizardOpen(false)}
              voices={voices}
              voicesLoading={voicesLoading}
              saving={savingAgent}
              onSave={handleWizardSave}
            />

            <AgentDetailModal
              open={detailAgentId !== null}
              agent={detailAgent}
              mode={detailMode}
              voices={voices}
              voicesLoading={voicesLoading}
              saving={savingAgent}
              onClose={() => setDetailAgentId(null)}
              onCancelEdit={() => setDetailMode("view")}
              onEdit={() => setDetailMode("edit")}
              onSave={handleDetailSave}
            />

            {forwardingActive && (
              <section className="space-y-4">
                <h2>Kalender</h2>
                <CalendarIntegrations />
              </section>
            )}

            {forwardingActive && calendars.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Terminvereinbarung</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-btn border border-stroke p-4">
                    <p className="font-medium text-text">Termine durch den Agenten</p>
                    <Switch checked={apptEnabled} onCheckedChange={setApptEnabled} />
                  </div>
                  {apptEnabled && (
                    <div className="space-y-2">
                      <Label>Kalender</Label>
                      <Select
                        value={apptProvider}
                        onValueChange={(v) =>
                          setApptProvider(v as CalendarProviderId)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Kalender auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {calendars.map((c) => (
                            <SelectItem key={c.provider} value={c.provider}>
                              {CALENDAR_LABELS[c.provider]}
                              {c.accountLabel ? ` · ${c.accountLabel}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSaveAppointment}
                    disabled={savingAppt}
                  >
                    {savingAppt && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Speichern
                  </Button>
                </CardContent>
              </Card>
            )}

            {!statusLoading && (
              <PhoneNumberWizard
                phase={onboardingPhase}
                curaNumber={curaNumber}
                forwardingType={forwardingType}
                forwardingStatus={forwardingStatus}
                requesting={requestingNumber}
                confirming={confirmingForwarding}
                disconnecting={disconnectingPhone}
                onRequestNumber={handleRequestNumber}
                onConfirmForwarding={handleConfirmForwarding}
                onDisconnect={handleDisconnectPhone}
                onForwardingTypeChange={setForwardingType}
              />
            )}
          </div>
        </QuotaGate>
      </div>
    </>
  );
}
