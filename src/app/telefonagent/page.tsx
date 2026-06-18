"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallVolumeChart } from "@/components/telefonagent/CallVolumeChart";
import { CalendarIntegrations } from "@/components/integrations/CalendarIntegrations";
import { PhoneOnboarding } from "@/components/telefonagent/PhoneOnboarding";
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
  const [languageOptions, setLanguageOptions] =
    useState<LanguageOption[]>(DEFAULT_LANGUAGES);
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
  const [forwardingInstructions, setForwardingInstructions] = useState("");
  const [storedAgents, setStoredAgents] = useState<StoredAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [createNewAgent, setCreateNewAgent] = useState(false);
  const [requestingNumber, setRequestingNumber] = useState(false);
  const [confirmingForwarding, setConfirmingForwarding] = useState(false);

  const [agentOpen, setAgentOpen] = useState(false);

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
    if (s.forwardingInstructions)
      setForwardingInstructions(s.forwardingInstructions);
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

  const loadAgentIntoForm = useCallback((agent: StoredAgent) => {
    setSelectedAgentId(agent.id);
    setCreateNewAgent(false);
    setName(agent.name);
    setVoiceId(agent.voiceId);
    setLanguage(normalizeAgentLanguage(agent.language));
    setGreeting(agent.greeting);
    setSystemPrompt(agent.systemPrompt);
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
        setLanguageOptions(langs);
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
    if (onboardingPhase === "agent") {
      setAgentOpen(true);
      if (caps.hasApiKey && !settings.connected) {
        autoConnect().then(() => loadVoices());
      } else {
        loadVoices();
      }
    }
  }, [onboardingPhase, caps.hasApiKey, settings.connected, autoConnect, loadVoices]);

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

  async function handleSaveAgent() {
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
      return;
    }
    if (!voiceId) {
      toast.error("Bitte eine Stimme auswählen.");
      return;
    }
    setSavingAgent(true);
    try {
      const res = await fetch("/api/elevenlabs/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          voiceId,
          voiceName: voices.find((v) => v.id === voiceId)?.name,
          language,
          greeting,
          systemPrompt,
          agentId: createNewAgent ? undefined : selectedAgentId || undefined,
          createNew: createNewAgent || !selectedAgentId,
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
        toast.success(
          createNewAgent || !selectedAgentId
            ? "Agent erstellt"
            : "Agent aktualisiert"
        );
      } else {
        toast.error("Speichern fehlgeschlagen", { description: data.error });
      }
    } catch {
      toast.error("Netzwerkfehler beim Speichern");
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
        toast.success("Weiterleitung bestätigt — konfigurieren Sie jetzt Ihren Agenten.");
      } else {
        toast.error("Speichern fehlgeschlagen");
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setConfirmingForwarding(false);
    }
  }

  function handleSelectAgent(agentId: string) {
    if (agentId === "__new__") {
      setCreateNewAgent(true);
      setSelectedAgentId("");
      setName(mockAgentConfig.name);
      setGreeting(mockAgentConfig.greeting);
      setSystemPrompt(caps.defaultSystemPrompt);
      return;
    }
    const agent = storedAgents.find((a) => a.id === agentId);
    if (agent) loadAgentIntoForm(agent);
  }

  async function handleActivateAgent(agentId: string) {
    const agent = storedAgents.find((a) => a.id === agentId);
    if (!agent) return;
    loadAgentIntoForm(agent);
    setSavingAgent(true);
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
        toast.success(`${agent.name} ist jetzt aktiv`);
      }
    } finally {
      setSavingAgent(false);
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
  const showAgentPanel =
    onboardingPhase === "agent" || onboardingPhase === "fertig";

  return (
    <>
    <div className="space-y-8">
      <h1>Telefonagent</h1>

      <CallVolumeChart />

    <QuotaGate>
    <div className="space-y-8">
      {!statusLoading && (
        <PhoneOnboarding
          phase={onboardingPhase}
          curaNumber={curaNumber}
          forwardingInstructions={forwardingInstructions}
          forwardingType={forwardingType}
          onForwardingTypeChange={setForwardingType}
          requesting={requestingNumber}
          confirming={confirmingForwarding}
          onRequestNumber={handleRequestNumber}
          onConfirmForwarding={handleConfirmForwarding}
        />
      )}

      {forwardingActive && (
        <section className="space-y-4">
          <div>
            <h2>Kalender</h2>
            <p className="mt-1 text-text-muted">
              Verbinden Sie einen Kalender, damit Ihr Telefonagent Termine
              direkt eintragen kann.
            </p>
          </div>
          <CalendarIntegrations />
        </section>
      )}

      {forwardingActive && calendars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 stroke-[1.5] text-accent" />
              Terminvereinbarung
            </CardTitle>
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

      {showAgentPanel && (
      <div className="rounded-card border border-stroke bg-surface">
        <button
          type="button"
          onClick={() => setAgentOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={agentOpen}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <Bot className="h-5 w-5 stroke-[1.5] text-accent" />
            </span>
            <div>
              <p className="label-caps text-text-muted">Agent</p>
              <p className="text-h3 text-navy">
                {settings.agentName || name || "Neuer Agent"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-text-muted">
            <span className="text-caption">
              {agentOpen ? "Schliessen" : "Bearbeiten"}
            </span>
            <ChevronDown
              className={`h-5 w-5 stroke-[1.5] transition-transform ${
                agentOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {agentOpen && (
          <div className="border-t border-stroke p-6">
            <Tabs defaultValue="config">
              <TabsList>
                <TabsTrigger value="config">Konfiguration</TabsTrigger>
                <TabsTrigger value="hours">Geschäftszeiten</TabsTrigger>
                <TabsTrigger value="escalation">Eskalation</TabsTrigger>
                <TabsTrigger value="knowledge">Wissensbasis</TabsTrigger>
              </TabsList>

              <TabsContent value="config">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5 stroke-[1.5] text-accent" />
                      Agent-Konfiguration
                    </CardTitle>
                    <CardDescription>
                      {settings.agentId
                        ? `Agent-ID: ${settings.agentId}`
                        : "Wird beim ersten Speichern erstellt."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {storedAgents.length > 0 && (
                      <div className="space-y-2">
                        <Label>Aktiver Agent</Label>
                        <Select
                          value={selectedAgentId || settings.agentId || ""}
                          onValueChange={handleSelectAgent}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Agent auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {storedAgents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                                {settings.agentId === a.id ? " · aktiv" : ""}
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__">+ Neuer Agent</SelectItem>
                          </SelectContent>
                        </Select>
                        {selectedAgentId &&
                          settings.agentId !== selectedAgentId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleActivateAgent(selectedAgentId)}
                              disabled={savingAgent}
                            >
                              Als aktiv setzen
                            </Button>
                          )}
                      </div>
                    )}
                    {onboardingPhase === "agent" && (
                      <p className="rounded-btn bg-baby-blue/40 p-3 text-body text-text">
                        Richten Sie mindestens einen Agenten ein und speichern
                        Sie ihn. Sie können später weitere Agenten anlegen und
                        jederzeit einen anderen aktivieren.
                      </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="agent-name">Agent-Name</Label>
                        <Input
                          id="agent-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stimme</Label>
                        {voicesLoading ? (
                          <Skeleton className="h-10 w-full" />
                        ) : voices.length === 0 ? (
                          <p className="text-body text-text-muted">
                            Keine deutschfähigen Stimmen im ElevenLabs-Workspace
                            gefunden.
                          </p>
                        ) : (
                          <Select
                            value={voiceId}
                            onValueChange={setVoiceId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Stimme auswählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {voices.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {v.name} · {v.language}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Sprache</Label>
                        <Select value={language} onValueChange={setLanguage}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {languageOptions
                              .filter((l) => l.available)
                              .map((l) => (
                                <SelectItem key={l.value} value={l.value}>
                                  {l.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-caption text-text-muted">
                          Schweizerdeutsch wird über Sprachanweisungen gesteuert;
                          wählen Sie nach Möglichkeit eine passende Stimme.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="greeting">Begrüssungstext</Label>
                      <textarea
                        id="greeting"
                        className="flex min-h-[80px] w-full rounded-btn border border-stroke bg-surface px-3 py-2 text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        value={greeting}
                        onChange={(e) => setGreeting(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="system-prompt">Anweisungen</Label>
                      <textarea
                        id="system-prompt"
                        className="flex min-h-[220px] w-full rounded-btn border border-stroke bg-surface px-3 py-2 font-mono text-caption leading-relaxed text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleSaveAgent}
                      disabled={savingAgent || !voiceId}
                    >
                      {savingAgent && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {settings.agentId ? "Agent aktualisieren" : "Agent erstellen"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="hours">
                <Card>
                  <CardContent className="space-y-4 pt-6">
                    {Object.entries(mockAgentConfig.businessHours).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <Label className="capitalize">
                            {key === "weekdays"
                              ? "Wochentage"
                              : key === "saturday"
                                ? "Samstag"
                                : "Sonntag"}
                          </Label>
                          <Input className="w-48" defaultValue={value} />
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="escalation">
                <Card>
                  <CardContent className="space-y-3 pt-6">
                    {mockAgentConfig.escalationRules.map((rule, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 rounded-btn border border-stroke p-3"
                      >
                        <span className="text-body text-text">{rule}</span>
                        <Switch defaultChecked />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="knowledge">
                <Card>
                  <CardContent className="space-y-3 pt-6">
                    {mockAgentConfig.knowledgeBase.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-btn bg-baby-blue/40 p-3 text-body text-text"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 stroke-[1.5] text-accent" />
                        {item}
                      </div>
                    ))}
                    <Separator />
                    <Button variant="outline" size="sm">
                      Eintrag hinzufügen
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
      )}
    </div>
    </QuotaGate>
    </div>
    </>
  );
}
