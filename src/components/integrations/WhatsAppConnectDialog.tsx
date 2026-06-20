"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWhatsAppNumberDisplay } from "@/lib/integrations/whatsapp/number";
import { WHATSAPP_ONBOARDING_COPY } from "@/lib/integrations/whatsapp/provider-meta";
import { cn } from "@/lib/utils";

export type WhatsAppWizardStep =
  | "number"
  | "guide"
  | "confirm"
  | "verify"
  | "done";

export interface WhatsAppConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: WhatsAppWizardStep;
  whatsappNumber: string;
  onWhatsappNumberChange: (value: string) => void;
  displayNumber: string;
  pairingCode: string;
  pairingSteps: string[];
  pairingConfirm: string;
  onPairingConfirmChange: (value: string) => void;
  verificationCode: string;
  onVerificationCodeChange: (value: string) => void;
  saving: boolean;
  onStartConnection: () => void;
  onGoToConfirm: () => void;
  onGoToGuide: () => void;
  onGoBackFromVerify: () => void;
  onConfirmPairing: () => void;
  onVerifyConnection: () => void;
}

export function WhatsAppConnectDialog({
  open,
  onOpenChange,
  step,
  whatsappNumber,
  onWhatsappNumberChange,
  displayNumber,
  pairingCode,
  pairingSteps,
  pairingConfirm,
  onPairingConfirmChange,
  verificationCode,
  onVerificationCodeChange,
  saving,
  onStartConnection,
  onGoToConfirm,
  onGoToGuide,
  onGoBackFromVerify,
  onConfirmPairing,
  onVerifyConnection,
}: WhatsAppConnectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "done"
              ? "WhatsApp verbunden"
              : step === "guide"
                ? "WhatsApp verknüpfen"
                : "Persönliches WhatsApp verbinden"}
          </DialogTitle>
          <DialogDescription>
            {step === "number"
              ? WHATSAPP_ONBOARDING_COPY.numberHint
              : step === "guide"
                ? WHATSAPP_ONBOARDING_COPY.pairingIntro
                : step === "confirm"
                  ? WHATSAPP_ONBOARDING_COPY.pairingConfirmHint
                  : step === "verify"
                    ? WHATSAPP_ONBOARDING_COPY.verifyHint
                    : WHATSAPP_ONBOARDING_COPY.doneBody}
          </DialogDescription>
        </DialogHeader>

        {step === "number" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp-number" className="text-[12px] text-[#525866]">
                Ihre WhatsApp-Nummer
              </Label>
              <Input
                id="whatsapp-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+41 79 123 45 67"
                value={whatsappNumber}
                onChange={(event) => onWhatsappNumberChange(event.target.value)}
                className="font-mono text-[15px]"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className={cn(landingBtnSecondary, "flex-1 justify-center")}
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={cn(landingBtnPrimary, "flex-1 justify-center")}
                onClick={onStartConnection}
                disabled={saving || !whatsappNumber.trim()}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Weiter
              </button>
            </div>
          </div>
        ) : null}

        {step === "guide" ? (
          <div className="space-y-4">
            <div className="rounded border border-[#335cff]/30 bg-[#F8FAFF] px-4 py-3 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#525866]">
                {WHATSAPP_ONBOARDING_COPY.pairingCodeLabel}
              </p>
              <p className="mt-1 font-mono text-[24px] font-semibold tracking-wider text-[#0E121B]">
                {pairingCode}
              </p>
              <p className="mt-1 text-[12px] text-[#525866]">{displayNumber}</p>
            </div>

            <ol className="space-y-2.5">
              {pairingSteps.map((item, index) => (
                <li key={item} className="flex gap-3 text-[13px] text-[#0E121B]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBEEF4] text-[11px] font-medium text-[#335cff]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{item}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className={cn(landingBtnPrimary, "w-full justify-center")}
              onClick={onGoToConfirm}
            >
              Code eingegeben — weiter
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp-pairing" className="text-[12px] text-[#525866]">
                {WHATSAPP_ONBOARDING_COPY.pairingConfirmLabel}
              </Label>
              <Input
                id="whatsapp-pairing"
                autoComplete="off"
                placeholder="LINKER-1234"
                value={pairingConfirm}
                onChange={(event) =>
                  onPairingConfirmChange(event.target.value.toUpperCase())
                }
                className="font-mono text-center text-[18px] tracking-wider"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className={cn(landingBtnSecondary, "flex-1 justify-center")}
                onClick={onGoToGuide}
                disabled={saving}
              >
                Zurück
              </button>
              <button
                type="button"
                className={cn(landingBtnPrimary, "flex-1 justify-center")}
                onClick={onConfirmPairing}
                disabled={saving || !pairingConfirm.trim()}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Verbinden
              </button>
            </div>
          </div>
        ) : null}

        {step === "verify" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp-code" className="text-[12px] text-[#525866]">
                Bestätigungscode
              </Label>
              <Input
                id="whatsapp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={verificationCode}
                onChange={(event) =>
                  onVerificationCodeChange(
                    event.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                className="font-mono text-center text-[18px] tracking-[0.3em]"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className={cn(landingBtnSecondary, "flex-1 justify-center")}
                onClick={onGoBackFromVerify}
                disabled={saving}
              >
                Zurück
              </button>
              <button
                type="button"
                className={cn(landingBtnPrimary, "flex-1 justify-center")}
                onClick={onVerifyConnection}
                disabled={saving || verificationCode.length !== 6}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Fertig
              </button>
            </div>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="space-y-4">
            <div className="rounded border border-[#335cff]/30 bg-[#F8FAFF] px-4 py-3">
              <div className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#335cff]" />
                <div>
                  <p className="text-[13px] font-medium text-[#0E121B]">
                    {WHATSAPP_ONBOARDING_COPY.doneTitle}
                  </p>
                  <p className="mt-1 text-[12px] text-[#525866]">
                    {WHATSAPP_ONBOARDING_COPY.doneBody}
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/nachrichten"
              className={cn(landingBtnPrimary, "w-full justify-center no-underline")}
              onClick={() => onOpenChange(false)}
            >
              {WHATSAPP_ONBOARDING_COPY.nachrichtenCta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function useWhatsAppConnectWizard(onConnected?: () => void) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<WhatsAppWizardStep>("number");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [displayNumber, setDisplayNumber] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingSteps, setPairingSteps] = useState<string[]>([]);
  const [pairingConfirm, setPairingConfirm] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  function resetWizard() {
    setStep("number");
    setWhatsappNumber("");
    setConnectionId(null);
    setDisplayNumber("");
    setPairingCode("");
    setPairingSteps([]);
    setPairingConfirm("");
    setVerificationCode("");
  }

  function openWizard() {
    resetWizard();
    setDialogOpen(true);
  }

  function handleOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) resetWizard();
  }

  async function startConnection() {
    const trimmed = whatsappNumber.trim();
    if (!trimmed) {
      toast.error("Bitte Ihre WhatsApp-Nummer eingeben.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: trimmed }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast.error("Verbindung fehlgeschlagen", { description: data.error });
        return;
      }

      setConnectionId(data.connectionId);
      setDisplayNumber(data.displayNumber ?? formatWhatsAppNumberDisplay(trimmed));
      setPairingCode(data.pairingCode ?? "");
      setPairingSteps((data.steps ?? []) as string[]);
      setStep("guide");
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPairing() {
    if (!connectionId || !pairingConfirm.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          pairingCode: pairingConfirm,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast.error("Verknüpfung fehlgeschlagen", { description: data.error });
        return;
      }

      if (data.verificationRequired) {
        setStep("verify");
        if (data.devVerificationCode) {
          toast.message("Entwicklungsmodus", {
            description: `Code: ${data.devVerificationCode}`,
          });
        }
        return;
      }

      setStep("done");
      toast.success("WhatsApp verbunden");
      onConnected?.();
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  async function verifyConnection() {
    if (!connectionId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          code: verificationCode,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast.error("Verifizierung fehlgeschlagen", { description: data.error });
        return;
      }

      setStep("done");
      toast.success("WhatsApp verbunden");
      onConnected?.();
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  return {
    dialogOpen,
    step,
    whatsappNumber,
    setWhatsappNumber,
    displayNumber,
    pairingCode,
    pairingSteps,
    pairingConfirm,
    setPairingConfirm,
    verificationCode,
    setVerificationCode,
    saving,
    openWizard,
    handleOpenChange,
    startConnection: () => void startConnection(),
    confirmPairing: () => void confirmPairing(),
    verifyConnection: () => void verifyConnection(),
    setStep,
  };
}
