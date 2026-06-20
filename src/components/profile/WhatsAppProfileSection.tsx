"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { IntegrationLogoTile } from "@/components/integrations/IntegrationLogoTile";
import {
  useWhatsAppConnectWizard,
  WhatsAppConnectDialog,
} from "@/components/integrations/WhatsAppConnectDialog";
import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { INTEGRATION_LOGOS } from "@/lib/integrations/integration-logos";
import { formatWhatsAppNumberDisplay } from "@/lib/integrations/whatsapp/number";
import {
  WHATSAPP_ONBOARDING_COPY,
  WHATSAPP_PROFILE_COPY,
  type WhatsAppAccountType,
} from "@/lib/integrations/whatsapp/provider-meta";
import { userLabelClass, userPanelClass } from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

interface WhatsAppStatus {
  id: string;
  whatsappNumber: string;
  phoneNumber: string;
  accountType: WhatsAppAccountType;
  connected: boolean;
  connectedAt?: string;
}

export function WhatsAppProfileSection() {
  const [connections, setConnections] = useState<WhatsAppStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();

      if (res.ok && data.ok) {
        setConnections((data.whatsapp ?? []) as WhatsAppStatus[]);
      } else {
        setConnections([]);
      }
    } catch {
      toast.error("WhatsApp-Status konnte nicht geladen werden");
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const wizard = useWhatsAppConnectWizard(() => void load());
  const activeConnection = connections.find((entry) => entry.connected);

  async function disconnect() {
    if (!activeConnection) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: activeConnection.id }),
      });
      if (res.ok) {
        toast.success("WhatsApp getrennt");
        await load();
      } else {
        toast.error("Trennen fehlgeschlagen");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-40 w-full rounded-btn" />;
  }

  const numberLabel =
    activeConnection?.whatsappNumber || activeConnection?.phoneNumber;

  return (
    <section className="scroll-mt-8 space-y-4 border-t border-stroke pt-8">
      <div>
        <p className="text-body font-medium text-navy">{WHATSAPP_PROFILE_COPY.title}</p>
        <p className="mt-1 text-body text-text-muted">{WHATSAPP_PROFILE_COPY.intro}</p>
      </div>

      <div className={cn(userPanelClass, "p-4 sm:p-5")}>
        <div className="flex items-start gap-4">
          <IntegrationLogoTile
            src={INTEGRATION_LOGOS.whatsapp.src}
            width={INTEGRATION_LOGOS.whatsapp.width}
            height={INTEGRATION_LOGOS.whatsapp.height}
            fit="contain"
          />
          <div className="min-w-0 flex-1">
            {activeConnection && numberLabel ? (
              <>
                <p className="font-mono text-body font-medium text-navy">
                  {formatWhatsAppNumberDisplay(numberLabel)}
                </p>
                <p className={`${userLabelClass} mt-1`}>
                  {WHATSAPP_PROFILE_COPY.connectedHint}
                </p>
                {activeConnection.connectedAt ? (
                  <p className="mt-1 text-caption text-text-muted">
                    Verbunden seit{" "}
                    {new Date(activeConnection.connectedAt).toLocaleDateString("de-CH", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-body font-medium text-navy">
                  Noch nicht verbunden
                </p>
                <p className={`${userLabelClass} mt-1`}>
                  {WHATSAPP_PROFILE_COPY.notConnectedHint}
                </p>
              </>
            )}
          </div>
        </div>

        {!activeConnection ? (
          <ol className="mt-4 space-y-2 border-t border-stroke pt-4">
            {WHATSAPP_PROFILE_COPY.previewSteps.map((step, index) => (
              <li
                key={step}
                className="flex gap-3 text-caption text-text"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[11px] font-medium text-accent">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-t border-stroke pt-4 sm:flex-row sm:items-center">
          {activeConnection ? (
            <>
              <Link
                href="/nachrichten"
                className={cn(landingBtnPrimary, "justify-center no-underline sm:flex-1")}
              >
                {WHATSAPP_ONBOARDING_COPY.nachrichtenCta}
              </Link>
              <button
                type="button"
                className={cn(landingBtnSecondary, "justify-center sm:shrink-0")}
                onClick={() => void disconnect()}
                disabled={disconnecting}
              >
                {disconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                Trennen
              </button>
            </>
          ) : (
            <button
              type="button"
              className={cn(landingBtnPrimary, "justify-center")}
              onClick={wizard.openWizard}
            >
              WhatsApp verbinden
            </button>
          )}
        </div>
      </div>

      <p className="text-caption text-text-muted">{WHATSAPP_PROFILE_COPY.privacyNote}</p>

      <WhatsAppConnectDialog
        open={wizard.dialogOpen}
        onOpenChange={wizard.handleOpenChange}
        step={wizard.step}
        whatsappNumber={wizard.whatsappNumber}
        onWhatsappNumberChange={wizard.setWhatsappNumber}
        displayNumber={wizard.displayNumber}
        pairingCode={wizard.pairingCode}
        pairingSteps={wizard.pairingSteps}
        pairingConfirm={wizard.pairingConfirm}
        onPairingConfirmChange={wizard.setPairingConfirm}
        verificationCode={wizard.verificationCode}
        onVerificationCodeChange={wizard.setVerificationCode}
        saving={wizard.saving}
        onStartConnection={wizard.startConnection}
        onGoToConfirm={() => wizard.setStep("confirm")}
        onGoToGuide={() => wizard.setStep("guide")}
        onGoBackFromVerify={() => wizard.setStep("confirm")}
        onConfirmPairing={wizard.confirmPairing}
        onVerifyConnection={wizard.verifyConnection}
      />
    </section>
  );
}
