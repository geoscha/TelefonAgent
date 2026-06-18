"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  forwardingActivateCode,
  forwardingDeactivateCode,
  forwardingDeactivateHint,
  type ForwardingType,
} from "@/lib/phone/forwarding-codes";
import type { OnboardingPhase } from "@/lib/onboarding-types";

type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";

type WizardFlow = "overview" | "connect" | "disconnect";
type ConnectStep = "type" | "code" | "confirm";
type DisconnectStep = "code" | "confirm";

interface PhoneNumberWizardProps {
  phase: OnboardingPhase;
  curaNumber: string;
  forwardingType: ForwardingType;
  forwardingStatus: ForwardingStatus;
  forwardingInstructions?: string;
  requesting: boolean;
  confirming: boolean;
  disconnecting: boolean;
  onRequestNumber: () => void;
  onConfirmForwarding: () => Promise<boolean>;
  onDisconnect: () => Promise<boolean>;
  onForwardingTypeChange: (v: ForwardingType) => void;
}

export function PhoneNumberWizard({
  phase,
  curaNumber,
  forwardingType,
  forwardingStatus,
  forwardingInstructions,
  requesting,
  confirming,
  disconnecting,
  onRequestNumber,
  onConfirmForwarding,
  onDisconnect,
  onForwardingTypeChange,
}: PhoneNumberWizardProps) {
  const [flow, setFlow] = useState<WizardFlow>("overview");
  const [connectStep, setConnectStep] = useState<ConnectStep>("type");
  const [disconnectStep, setDisconnectStep] = useState<DisconnectStep>("code");

  const hasNumber = Boolean(curaNumber);
  const isConnected = forwardingStatus === "aktiv";

  const activateCode = useMemo(
    () => (curaNumber ? forwardingActivateCode(curaNumber, forwardingType) : ""),
    [curaNumber, forwardingType]
  );
  const deactivateCode = forwardingDeactivateCode(forwardingType);

  const statusLabel = isConnected
    ? "Verbunden"
    : phase === "nummer_warte"
      ? "Nummer wird eingerichtet"
      : !hasNumber
        ? "Keine Nummer"
        : "Nicht verbunden";

  const showStatusBadge = !(
    hasNumber &&
    !isConnected &&
    (forwardingStatus === "anleitung" || forwardingStatus === "nicht_eingerichtet")
  );

  function resetToOverview() {
    setFlow("overview");
    setConnectStep("type");
    setDisconnectStep("code");
  }

  function startConnect() {
    if (!hasNumber) {
      onRequestNumber();
      return;
    }
    setFlow("connect");
    setConnectStep("type");
  }

  function startDisconnect() {
    setFlow("disconnect");
    setDisconnectStep("code");
  }

  return (
    <section className="w-full rounded-[22px] border border-stroke bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium text-navy">Telefon</p>
        {showStatusBadge && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isConnected
                ? "bg-emerald-100 text-emerald-800"
                : "bg-bg text-text-muted"
            }`}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {flow === "overview" && (
        <OverviewStep
          phase={phase}
          curaNumber={curaNumber}
          hasNumber={hasNumber}
          isConnected={isConnected}
          requesting={requesting}
          onRequestNumber={onRequestNumber}
          onStartConnect={startConnect}
          onStartDisconnect={startDisconnect}
        />
      )}

      {flow === "connect" && phase === "nummer_warte" && (
        <WaitStep onBack={resetToOverview} />
      )}

      {flow === "connect" && connectStep === "type" && phase !== "nummer_warte" && (
        <ConnectTypeStep
          forwardingType={forwardingType}
          onChange={onForwardingTypeChange}
          onBack={resetToOverview}
          onNext={() => setConnectStep("code")}
        />
      )}

      {flow === "connect" && connectStep === "code" && (
        <ConnectCodeStep
          curaNumber={curaNumber}
          activateCode={activateCode}
          onBack={() => setConnectStep("type")}
          onNext={() => setConnectStep("confirm")}
        />
      )}

      {flow === "connect" && connectStep === "confirm" && (
        <ConnectConfirmStep
          confirming={confirming}
          onBack={() => setConnectStep("code")}
          onConfirm={onConfirmForwarding}
          onDone={resetToOverview}
        />
      )}

      {flow === "disconnect" && disconnectStep === "code" && (
        <DisconnectCodeStep
          deactivateCode={deactivateCode}
          hint={forwardingDeactivateHint(forwardingType)}
          onBack={resetToOverview}
          onNext={() => setDisconnectStep("confirm")}
        />
      )}

      {flow === "disconnect" && disconnectStep === "confirm" && (
        <DisconnectConfirmStep
          disconnecting={disconnecting}
          onBack={() => setDisconnectStep("code")}
          onConfirm={onDisconnect}
          onDone={resetToOverview}
        />
      )}
    </section>
  );
}

function OverviewStep({
  phase,
  curaNumber,
  hasNumber,
  isConnected,
  requesting,
  onRequestNumber,
  onStartConnect,
  onStartDisconnect,
}: {
  phase: OnboardingPhase;
  curaNumber: string;
  hasNumber: boolean;
  isConnected: boolean;
  requesting: boolean;
  onRequestNumber: () => void;
  onStartConnect: () => void;
  onStartDisconnect: () => void;
}) {
  if (phase === "nummer_warte") {
    return (
      <div className="mt-3">
        <p className="text-[13px] text-text-muted">Nummer wird eingerichtet…</p>
      </div>
    );
  }

  if (!hasNumber) {
    return (
      <div className="mt-3">
        <Button size="sm" className="h-9 rounded-full text-[13px]" onClick={onRequestNumber} disabled={requesting}>
          {requesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nummer beantragen
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="font-mono text-[14px] text-navy">{curaNumber}</p>
      <div className="flex flex-wrap gap-2">
        {!isConnected && (
          <Button size="sm" className="h-9 rounded-full text-[13px]" onClick={onStartConnect}>
            Verbinden
          </Button>
        )}
        {(isConnected || phase === "fertig" || phase === "agent") && (
          <Button size="sm" variant="outline" className="h-9 rounded-full text-[13px]" onClick={onStartDisconnect}>
            Entkoppeln
          </Button>
        )}
      </div>
    </div>
  );
}

function WaitStep({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] text-text-muted">Nummer wird eingerichtet…</p>
      <Button size="sm" variant="outline" className="h-9 rounded-full text-[13px]" onClick={onBack}>
        Zurück
      </Button>
    </div>
  );
}

function ConnectTypeStep({
  forwardingType,
  onChange,
  onBack,
  onNext,
}: {
  forwardingType: ForwardingType;
  onChange: (v: ForwardingType) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] text-text-muted">Weiterleitungstyp</p>
      <div className="flex flex-wrap gap-1.5">
        <TypeChip
          active={forwardingType === "bedingt"}
          label="Überlauf"
          onClick={() => onChange("bedingt")}
        />
        <TypeChip
          active={forwardingType === "alle"}
          label="Alle"
          onClick={() => onChange("alle")}
        />
      </div>
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Weiter" />
    </div>
  );
}

function ConnectCodeStep({
  curaNumber,
  activateCode,
  onBack,
  onNext,
}: {
  curaNumber: string;
  activateCode: string;
  forwardingInstructions?: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] text-text-muted">Code wählen &amp; anrufen</p>
      <CopyRow label="Nummer" value={curaNumber} mono />
      {activateCode && <CopyRow label="Code" value={activateCode} mono />}
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Weiter" />
    </div>
  );
}

function ConnectConfirmStep({
  confirming,
  onBack,
  onConfirm,
  onDone,
}: {
  confirming: boolean;
  onBack: () => void;
  onConfirm: () => Promise<boolean>;
  onDone: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] text-text-muted">Weiterleitung aktiv?</p>
      <StepNav
        onBack={onBack}
        onNext={async () => {
          const ok = await onConfirm();
          if (ok) onDone();
        }}
        nextLabel="Bestätigen"
        nextDisabled={confirming}
        nextLoading={confirming}
      />
    </div>
  );
}

function DisconnectCodeStep({
  deactivateCode,
  hint,
  onBack,
  onNext,
}: {
  deactivateCode: string;
  hint: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] text-text-muted">{hint}</p>
      <CopyRow label="Code" value={deactivateCode} mono />
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Weiter" />
    </div>
  );
}

function DisconnectConfirmStep({
  disconnecting,
  onBack,
  onConfirm,
  onDone,
}: {
  disconnecting: boolean;
  onBack: () => void;
  onConfirm: () => Promise<boolean>;
  onDone: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] text-text-muted">Entkoppelt?</p>
      <StepNav
        onBack={onBack}
        onNext={async () => {
          const ok = await onConfirm();
          if (ok) onDone();
        }}
        nextLabel="Bestätigen"
        nextDisabled={disconnecting}
        nextLoading={disconnecting}
        nextVariant="outline"
      />
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
  nextVariant = "default",
}: {
  onBack: () => void;
  onNext: () => void | Promise<void>;
  nextLabel: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  nextVariant?: "default" | "outline";
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button type="button" size="sm" variant="outline" onClick={onBack}>
        Zurück
      </Button>
      <Button
        type="button"
        size="sm"
        variant={nextVariant}
        onClick={() => void onNext()}
        disabled={nextDisabled}
      >
        {nextLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {nextLabel}
      </Button>
    </div>
  );
}

function TypeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active ? "bg-accent text-white" : "bg-bg text-text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Kopiert");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="text-[11px] font-medium text-text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <div
          className={`min-w-0 flex-1 truncate rounded-btn border border-stroke bg-bg/50 px-3 py-2 ${
            mono ? "font-mono text-caption" : "text-body"
          }`}
        >
          {value}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
