"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CalendarIntegrations } from "@/components/integrations/CalendarIntegrations";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { AgentStatusHero } from "@/components/telefonagent/AgentStatusHero";
import {
  PhoneNumberWizard,
  type PendingPhoneRequestView,
  type UserPhoneNumberView,
} from "@/components/telefonagent/PhoneNumberWizard";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
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
import { notifyTokenBalanceChanged } from "@/lib/hooks/useTokenBalance";
import { useWorkspace } from "@/lib/hooks/useWorkspace";
import type { OnboardingPhase } from "@/lib/onboarding-types";

type ForwardingType = "alle" | "bedingt";
type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";
type CalendarProviderId = "google" | "microsoft" | "apple";

interface Settings {
  forwardingType?: ForwardingType;
  forwardingStatus?: ForwardingStatus;
  appointmentBookingEnabled?: boolean;
  appointmentProvider?: CalendarProviderId;
  curaForwardingNumber?: string;
  onboardingPhase?: OnboardingPhase;
}

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

export default function PhonesPage() {
  const setupDemo = useSetupDemoOptional();
  const { data: workspace, loading: workspaceLoading, revalidate: revalidateWorkspace } =
    useWorkspace();
  const statusLoading = workspaceLoading && workspace === null;
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase>("nummer_anfragen");
  const [forwardingType, setForwardingType] =
    useState<ForwardingType>("bedingt");
  const [forwardingStatus, setForwardingStatus] =
    useState<ForwardingStatus>("nicht_eingerichtet");
  const [curaNumber, setCuraNumber] = useState("");
  const [numbers, setNumbers] = useState<UserPhoneNumberView[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingPhoneRequestView[]>([]);
  const [requestingNumber, setRequestingNumber] = useState(false);
  const [addingSip, setAddingSip] = useState(false);
  const [confirmingForwarding, setConfirmingForwarding] = useState(false);
  const [disconnectingPhone, setDisconnectingPhone] = useState(false);
  const [calendars, setCalendars] = useState<ConnectedCalendar[]>([]);
  const [apptEnabled, setApptEnabled] = useState(false);
  const [apptProvider, setApptProvider] = useState<CalendarProviderId | "">("");
  const [savingAppt, setSavingAppt] = useState(false);

  const applySettings = useCallback((s: Settings) => {
    if (s.onboardingPhase) setOnboardingPhase(s.onboardingPhase);
    if (s.forwardingType) setForwardingType(s.forwardingType);
    if (s.forwardingStatus) setForwardingStatus(s.forwardingStatus);
    if (s.curaForwardingNumber) setCuraNumber(s.curaForwardingNumber);
    if (typeof s.appointmentBookingEnabled === "boolean")
      setApptEnabled(s.appointmentBookingEnabled);
    if (s.appointmentProvider) setApptProvider(s.appointmentProvider);
  }, []);

  const applyWorkspace = useCallback(
    (data: NonNullable<typeof workspace>) => {
      applySettings(data.settings as Settings);
      setOnboardingPhase(data.phase);
      setNumbers(data.numbers);
      setPendingRequests(
        (data.pendingRequests ?? []).map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
        }))
      );
      const num =
        data.capabilities.forwardingNumber ??
        data.settings.curaForwardingNumber ??
        "";
      if (num) setCuraNumber(String(num));
    },
    [applySettings]
  );

  useEffect(() => {
    if (!workspace) return;
    applyWorkspace(workspace);
  }, [workspace, applyWorkspace]);

  const loadOnboarding = useCallback(async () => {
    await revalidateWorkspace();
  }, [revalidateWorkspace]);

  useEffect(() => {
    if (onboardingPhase !== "nummer_warte" && pendingRequests.length === 0) return;
    const interval = setInterval(() => {
      void loadOnboarding().catch(() => {
        /* keep polling */
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [onboardingPhase, pendingRequests.length, loadOnboarding]);

  useEffect(() => {
    if (forwardingStatus === "aktiv") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/elevenlabs/connect?reconcile=1");
        const data = await res.json();
        const s = data.settings as Settings;
        if (s.forwardingStatus === "aktiv") {
          setForwardingStatus("aktiv");
          applySettings(s);
          toast.success("Weiterleitung aktiv");
        }
      } catch {
        /* keep polling */
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [forwardingStatus, applySettings]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/integrations/status");
        const data = await res.json();
        if (res.ok && data.ok) {
          setCalendars(
            (data.calendars as ConnectedCalendar[]).filter((c) => c.connected)
          );
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  async function handleRequestNumber() {
    setRequestingNumber(true);
    try {
      const res = await fetch("/api/phone/request", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOnboardingPhase(data.phase as OnboardingPhase);
        applySettings(data.settings as Settings);
        await loadOnboarding();
        if (setupDemo?.active && setupDemo.step === "phone") {
          await setupDemo.completePhoneStep();
        }
        toast.success(
          data.autoAssigned
            ? "Nummer zugewiesen"
            : "Anfrage gesendet — Nummer folgt sobald verfügbar"
        );
        if (data.autoAssigned) {
          notifyTokenBalanceChanged();
        }
      } else {
        notifyTokenBalanceChanged();
        toast.error("Anfrage fehlgeschlagen", {
          description: data.error ?? "Bitte versuchen Sie es erneut.",
        });
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setRequestingNumber(false);
    }
  }

  async function handleAddSip(input: {
    phoneNumber: string;
    label?: string;
    outboundAddress?: string;
  }): Promise<boolean> {
    setAddingSip(true);
    try {
      const res = await fetch("/api/phone/sip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await loadOnboarding();
        toast.success("SIP-Nummer erfolgreich hinzugefügt");
        return true;
      }
      toast.error("SIP-Nummer nicht kompatibel", {
        description:
          data.error ??
          "Die Nummer ist nicht SIP-kompatibel oder Bot-Anrufe sind nicht möglich.",
      });
      return false;
    } catch {
      toast.error("Netzwerkfehler");
      return false;
    } finally {
      setAddingSip(false);
    }
  }

  async function handleCancelRequest(requestId: string) {
    try {
      const res = await fetch("/api/phone/request/cancel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await loadOnboarding();
        toast.success("Anfrage zurückgezogen");
      } else {
        toast.error("Zurückziehen fehlgeschlagen");
      }
    } catch {
      toast.error("Netzwerkfehler");
    }
  }

  async function handleConfirmForwarding(phoneId: string, customerNumber: string) {
    if (!customerNumber.trim()) {
      toast.error("Bitte Ihre Telefonnummer angeben.");
      return false;
    }
    setConfirmingForwarding(true);
    try {
      const res = await fetch("/api/phone/confirm-forwarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forwardingType, phoneId, customerNumber }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOnboardingPhase(data.phase as OnboardingPhase);
        applySettings(data.settings as Settings);
        setForwardingStatus("aktiv");
        if (data.numbers) setNumbers(data.numbers as UserPhoneNumberView[]);
        await loadOnboarding();
        toast.success("Weiterleitung verbunden");
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

  async function handleDisconnectPhone(phoneId: string) {
    setDisconnectingPhone(true);
    try {
      const res = await fetch("/api/phone/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOnboardingPhase(data.phase as OnboardingPhase);
        applySettings(data.settings as Settings);
        setForwardingStatus("nicht_eingerichtet");
        if (data.numbers) setNumbers(data.numbers as UserPhoneNumberView[]);
        await loadOnboarding();
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

  async function handleActivate(phoneId: string) {
    try {
      const res = await fetch(`/api/phone/numbers/${phoneId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        await loadOnboarding();
        toast.success("Nummer aktiviert");
      } else {
        toast.error("Aktivierung fehlgeschlagen");
      }
    } catch {
      toast.error("Netzwerkfehler");
    }
  }

  async function handleRemove(phoneId: string) {
    try {
      const res = await fetch(`/api/phone/numbers/${phoneId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNumbers((data.numbers as UserPhoneNumberView[]) ?? []);
        await loadOnboarding();
        toast.success("Nummer entfernt");
      } else {
        toast.error("Entfernen fehlgeschlagen");
      }
    } catch {
      toast.error("Netzwerkfehler");
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

  const forwardingActive = forwardingStatus === "aktiv";

  return (
    <QuotaGate>
      <div className="mx-auto max-w-[820px] space-y-6">
        {forwardingActive && (
          <AgentStatusHero isLive phoneNumber={curaNumber || undefined} />
        )}

        {statusLoading ? (
          <Skeleton className="h-48 w-full rounded" />
        ) : (
          <PhoneNumberWizard
            phase={onboardingPhase}
            numbers={numbers}
            pendingRequests={pendingRequests}
            forwardingType={forwardingType}
            requesting={requestingNumber}
            addingSip={addingSip}
            confirming={confirmingForwarding}
            disconnecting={disconnectingPhone}
            onRequestNumber={handleRequestNumber}
            onCancelRequest={handleCancelRequest}
            onAddSip={handleAddSip}
            onConfirmForwarding={handleConfirmForwarding}
            onDisconnect={handleDisconnectPhone}
            onActivate={handleActivate}
            onRemove={handleRemove}
            onForwardingTypeChange={setForwardingType}
          />
        )}

        {forwardingActive && (
          <section className={`${userPanelClass} space-y-4 p-5 sm:p-6`}>
            <h2 className={userTitleClass}>Kalender</h2>
            <CalendarIntegrations />
          </section>
        )}

        {forwardingActive && calendars.length > 0 && (
          <section className={`${userPanelClass} p-5 sm:p-6`}>
            <h2 className={userTitleClass}>Terminvereinbarung</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-4 rounded border border-[#E1E4EA] p-4">
                <p className={userTitleClass}>Termine durch den Agenten</p>
                <Switch checked={apptEnabled} onCheckedChange={setApptEnabled} />
              </div>
              {apptEnabled && (
                <div className="space-y-2">
                  <Label className={userLabelClass}>Kalender</Label>
                  <Select
                    value={apptProvider}
                    onValueChange={(v) => setApptProvider(v as CalendarProviderId)}
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
              <button
                type="button"
                className={landingBtnPrimary}
                onClick={handleSaveAppointment}
                disabled={savingAppt}
              >
                {savingAppt && <Loader2 className="h-4 w-4 animate-spin" />}
                Speichern
              </button>
            </div>
          </section>
        )}
      </div>
    </QuotaGate>
  );
}
