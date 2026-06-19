"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { QuotaGate } from "@/components/billing/QuotaGate";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import {
  PhoneNumberWizard,
  type PendingPhoneRequestView,
  type UserPhoneNumberView,
} from "@/components/telefonagent/PhoneNumberWizard";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyTokenBalanceChanged, useTokenBalance } from "@/lib/hooks/useTokenBalance";
import { useWorkspace } from "@/lib/hooks/useWorkspace";
import { formatBillingDateTime, PHONE_NUMBER_MONTHLY_TOKENS } from "@/lib/billing/quota-display";
import type { OnboardingPhase } from "@/lib/onboarding-types";

type ForwardingType = "alle" | "bedingt";
type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";

interface Settings {
  forwardingType?: ForwardingType;
  forwardingStatus?: ForwardingStatus;
  onboardingPhase?: OnboardingPhase;
}

export default function PhonesPage() {
  const router = useRouter();
  const setupDemo = useSetupDemoOptional();
  const { data: workspace, loading: workspaceLoading, revalidate: revalidateWorkspace } =
    useWorkspace();
  const { tokenBalance, loading: tokenLoading } = useTokenBalance();
  const canAffordPhoneNumber =
    PHONE_NUMBER_MONTHLY_TOKENS <= 0 ||
    (!tokenLoading && (tokenBalance?.balance ?? 0) >= PHONE_NUMBER_MONTHLY_TOKENS);
  const statusLoading = workspaceLoading && workspace === null;
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase>("nummer_anfragen");
  const [forwardingType, setForwardingType] =
    useState<ForwardingType>("bedingt");
  const [forwardingStatus, setForwardingStatus] =
    useState<ForwardingStatus>("nicht_eingerichtet");
  const [numbers, setNumbers] = useState<UserPhoneNumberView[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingPhoneRequestView[]>([]);
  const [requestingNumber, setRequestingNumber] = useState(false);
  const [addingSip, setAddingSip] = useState(false);
  const [confirmingForwarding, setConfirmingForwarding] = useState(false);
  const [disconnectingPhone, setDisconnectingPhone] = useState(false);

  const applySettings = useCallback((s: Settings) => {
    if (s.onboardingPhase) setOnboardingPhase(s.onboardingPhase);
    if (s.forwardingType) setForwardingType(s.forwardingType);
    if (s.forwardingStatus) setForwardingStatus(s.forwardingStatus);
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
    },
    [applySettings]
  );

  useEffect(() => {
    if (!workspace) return;
    applyWorkspace(workspace);
  }, [workspace, applyWorkspace]);

  useEffect(() => {
    if (
      !setupDemo?.active ||
      setupDemo.step !== "phone" ||
      setupDemo.subStepId !== "phone_tokens" ||
      tokenLoading
    ) {
      return;
    }
    if (canAffordPhoneNumber) {
      setupDemo.goToSubStep("phone_request");
    }
  }, [
    canAffordPhoneNumber,
    tokenLoading,
    setupDemo?.active,
    setupDemo?.step,
    setupDemo?.subStepId,
    setupDemo?.goToSubStep,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const topup = params.get("topup");
    const sessionId = params.get("session_id");

    if (topup === "cancel") {
      toast.message("Aufladung abgebrochen.");
      if (setupDemo?.active && setupDemo.step === "phone") {
        setupDemo.goToSubStep("phone_billing");
        router.push("/billing");
      }
      window.history.replaceState({}, "", "/phones");
      return;
    }

    if (topup !== "success") return;

    if (!sessionId) {
      toast.success("Zahlung erfolgreich. Guthaben wird in Kürze gutgeschrieben.");
      window.history.replaceState({}, "", "/phones");
      return;
    }

    fetch("/api/billing/verify-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          tokens?: number;
          duplicate?: boolean;
          error?: string;
        };
        if (res.ok && data.ok) {
          notifyTokenBalanceChanged();
          if (data.duplicate) {
            toast.success("Guthaben ist bereits gutgeschrieben.");
          } else {
            toast.success(
              data.tokens
                ? `${data.tokens.toLocaleString("de-CH")} Tokens gutgeschrieben.`
                : "Guthaben erfolgreich aufgeladen."
            );
          }
          if (setupDemo?.active && setupDemo.step === "phone") {
            setupDemo.goToSubStep("phone_request");
          }
          return;
        }
        toast.error(data.error ?? "Guthaben konnte nicht bestätigt werden.");
      })
      .catch(() => {
        toast.error("Zahlungsbestätigung fehlgeschlagen.");
      })
      .finally(() => {
        window.history.replaceState({}, "", "/phones");
      });
  }, [
    setupDemo?.active,
    setupDemo?.step,
    setupDemo?.goToSubStep,
    router,
  ]);

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
        if (data.code === "insufficient_tokens") {
          toast.error("Nicht genügend Tokens", {
            description: data.error ?? "Bitte laden Sie Ihr Guthaben unter Abrechnung auf.",
          });
        } else {
          toast.error("Anfrage fehlgeschlagen", {
            description: data.error ?? "Bitte versuchen Sie es erneut.",
          });
        }
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setRequestingNumber(false);
    }
  }

  async function handleAddSip(input: {
    phoneNumber: string;
  }): Promise<{ ok: true } | { ok: false }> {
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
        return { ok: true };
      }
      return { ok: false };
    } catch {
      toast.error("Netzwerkfehler");
      return { ok: false };
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
        toast.success("Nummer gekoppelt");
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
        if (data.scheduled && data.releaseAt) {
          toast.success("Nummer gekündigt", {
            description: `Wird am ${formatBillingDateTime(data.releaseAt as string)} entfernt.`,
          });
        } else {
          toast.success("Nummer gekündigt");
        }
      } else {
        toast.error(data.error ?? "Kündigung fehlgeschlagen");
      }
    } catch {
      toast.error("Netzwerkfehler");
    }
  }

  return (
    <QuotaGate>
      <div className="mx-auto max-w-[820px] space-y-6">
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
            canAffordPhoneNumber={canAffordPhoneNumber}
            demoPhoneStep={setupDemo?.subStepId ?? null}
          />
        )}
      </div>
    </QuotaGate>
  );
}
