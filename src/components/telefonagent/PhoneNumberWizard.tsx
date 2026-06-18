"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Info,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnGhost,
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { userLabelClass } from "@/components/user/user-styles";
import {
  forwardingActivateCode,
  forwardingDeactivateCode,
  forwardingDeactivateHint,
  type ForwardingType,
} from "@/lib/phone/forwarding-codes";
import type { OnboardingPhase } from "@/lib/onboarding-types";
import {
  formatBillingDateTime,
  formatPhoneNumberBillingAmount,
  formatPhoneNumberCostLabel,
  formatTokenCount,
  PHONE_NUMBER_MONTHLY_TOKENS,
  resolvePhoneNextBillingAt,
} from "@/lib/billing/quota-display";

type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";

export interface UserPhoneNumberView {
  id: string;
  phoneNumber: string;
  source: "pool" | "sip_trunk";
  label?: string;
  isPrimary: boolean;
  forwardingStatus?: ForwardingStatus;
  forwardingType?: ForwardingType;
  customerNumber?: string;
  validationStatus: "pending" | "valid" | "invalid";
  assignedAt?: string;
  nextBillingAt?: string;
  pausedAt?: string;
}

export interface PendingPhoneRequestView {
  id: string;
  createdAt: string;
}

function isPhoneLinked(num: UserPhoneNumberView): boolean {
  return num.forwardingStatus === "aktiv";
}

function needsCoupling(num: UserPhoneNumberView): boolean {
  return num.source === "pool";
}

function phoneListSubtitle(num: UserPhoneNumberView, isConnected: boolean): string {
  const parts: string[] = [num.source === "sip_trunk" ? "SIP Trunk" : "Cura Nummer"];
  const label = num.label?.trim();
  if (
    label &&
    label.toLowerCase() !== "cura nummer" &&
    label !== num.phoneNumber
  ) {
    parts.push(label);
  }
  if (isConnected) parts.push("Gekoppelt");
  if (num.customerNumber) parts.push(`von ${num.customerNumber}`);
  return parts.join(" · ");
}

function PhoneNumberInfoDialog({
  phone,
  open,
  onOpenChange,
}: {
  phone: UserPhoneNumberView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!phone) return null;

  const nextBillingAt = resolvePhoneNextBillingAt(phone);
  const billingAmount = formatPhoneNumberBillingAmount();
  const hasTokenCost = PHONE_NUMBER_MONTHLY_TOKENS > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-base font-normal">
            {phone.phoneNumber}
          </DialogTitle>
          <DialogDescription>
            {phone.source === "sip_trunk" ? "SIP Trunk" : "Cura Nummer"}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-[13px]">
          {phone.assignedAt && (
            <div>
              <dt className="text-[11px] text-[#525866]">Zugewiesen am</dt>
              <dd className="mt-0.5 text-[#0E121B]">
                {formatBillingDateTime(phone.assignedAt)}
              </dd>
            </div>
          )}
          {hasTokenCost && (
            <div>
              <dt className="text-[11px] text-[#525866]">Tokenkosten</dt>
              <dd className="mt-0.5 space-y-1 text-[#0E121B]">
                <p>
                  Beim Kauf: {formatTokenCount(PHONE_NUMBER_MONTHLY_TOKENS)} Tokens
                </p>
                <p>
                  Monatliche Gebühr: {formatTokenCount(PHONE_NUMBER_MONTHLY_TOKENS)}{" "}
                  Tokens
                </p>
              </dd>
            </div>
          )}
          {hasTokenCost && (
            <div>
              <dt className="text-[11px] text-[#525866]">Nächste Abbuchung</dt>
              <dd className="mt-0.5 text-[#0E121B]">
                {nextBillingAt ? (
                  <>
                    {formatBillingDateTime(nextBillingAt)}
                    {billingAmount ? ` · ${billingAmount}` : ""}
                  </>
                ) : (
                  "Ein Monat nach Zuweisung der Nummer"
                )}
              </dd>
            </div>
          )}
          {phone.pausedAt && (
            <p className="text-[13px] text-amber-700">
              Pausiert — bitte Guthaben aufladen
            </p>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

type WizardFlow = "overview" | "connect" | "disconnect" | "sip";
type ConnectStep = "type" | "customer" | "code" | "confirm";
type DisconnectStep = "code" | "confirm";

interface PhoneNumberWizardProps {
  phase: OnboardingPhase;
  numbers: UserPhoneNumberView[];
  pendingRequests: PendingPhoneRequestView[];
  forwardingType: ForwardingType;
  requesting: boolean;
  addingSip: boolean;
  confirming: boolean;
  disconnecting: boolean;
  onRequestNumber: () => void;
  onCancelRequest: (requestId: string) => Promise<void>;
  onAddSip: (input: {
    phoneNumber: string;
    label?: string;
    outboundAddress?: string;
  }) => Promise<boolean>;
  onConfirmForwarding: (
    phoneId: string,
    customerNumber: string
  ) => Promise<boolean>;
  onDisconnect: (phoneId: string) => Promise<boolean>;
  onActivate: (phoneId: string) => Promise<void>;
  onRemove: (phoneId: string) => Promise<void>;
  onForwardingTypeChange: (v: ForwardingType) => void;
  canAffordPhoneNumber: boolean;
}

export function PhoneNumberWizard({
  phase,
  numbers,
  pendingRequests,
  forwardingType,
  requesting,
  addingSip,
  confirming,
  disconnecting,
  onRequestNumber,
  onCancelRequest,
  onAddSip,
  onConfirmForwarding,
  onDisconnect,
  onActivate,
  onRemove,
  onForwardingTypeChange,
  canAffordPhoneNumber,
}: PhoneNumberWizardProps) {
  const [flow, setFlow] = useState<WizardFlow>("overview");
  const [connectStep, setConnectStep] = useState<ConnectStep>("type");
  const [disconnectStep, setDisconnectStep] = useState<DisconnectStep>("code");
  const [activePhoneId, setActivePhoneId] = useState<string | null>(null);
  const [customerNumber, setCustomerNumber] = useState("");
  const [sipNumber, setSipNumber] = useState("");
  const [sipLabel, setSipLabel] = useState("");
  const [sipAddress, setSipAddress] = useState("");

  const activePhone = numbers.find((n) => n.id === activePhoneId);
  const curaNumber = activePhone?.phoneNumber ?? "";
  const activeForwardingType = activePhone?.forwardingType ?? forwardingType;

  const activateCode = useMemo(
    () =>
      curaNumber
        ? forwardingActivateCode(curaNumber, activeForwardingType)
        : "",
    [curaNumber, activeForwardingType]
  );
  const deactivateCode = forwardingDeactivateCode(activeForwardingType);

  function resetToOverview() {
    setFlow("overview");
    setConnectStep("type");
    setDisconnectStep("code");
    setActivePhoneId(null);
    setCustomerNumber("");
    setSipNumber("");
    setSipLabel("");
    setSipAddress("");
  }

  function startConnect(phoneId: string) {
    const phone = numbers.find((n) => n.id === phoneId);
    setActivePhoneId(phoneId);
    setCustomerNumber(phone?.customerNumber ?? "");
    if (phone?.forwardingType) onForwardingTypeChange(phone.forwardingType);
    setFlow("connect");
    setConnectStep("type");
  }

  function startDisconnect(phoneId: string) {
    const phone = numbers.find((n) => n.id === phoneId);
    setActivePhoneId(phoneId);
    if (phone?.forwardingType) onForwardingTypeChange(phone.forwardingType);
    setFlow("disconnect");
    setDisconnectStep("code");
  }

  async function handleAddSip() {
    const ok = await onAddSip({
      phoneNumber: sipNumber,
      label: sipLabel || undefined,
      outboundAddress: sipAddress || undefined,
    });
    if (ok) resetToOverview();
  }

  return (
    <div className="w-full space-y-4">
      {flow === "overview" && (
        <OverviewStep
          phase={phase}
          numbers={numbers}
          pendingRequests={pendingRequests}
          requesting={requesting}
          addingSip={addingSip}
          onRequestNumber={onRequestNumber}
          onCancelRequest={onCancelRequest}
          onStartSip={() => setFlow("sip")}
          onStartConnect={startConnect}
          onStartDisconnect={startDisconnect}
          onActivate={onActivate}
          onRemove={onRemove}
          canAffordPhoneNumber={canAffordPhoneNumber}
        />
      )}

      {flow === "sip" && (
        <SipTrunkStep
          phoneNumber={sipNumber}
          label={sipLabel}
          outboundAddress={sipAddress}
          adding={addingSip}
          onPhoneNumberChange={setSipNumber}
          onLabelChange={setSipLabel}
          onAddressChange={setSipAddress}
          onBack={resetToOverview}
          onSubmit={handleAddSip}
        />
      )}

      {flow === "connect" && activePhone && (
        <PhoneBillingDetails phone={activePhone} />
      )}

      {flow === "connect" && connectStep === "type" && (
        <ConnectTypeStep
          forwardingType={activeForwardingType}
          onChange={onForwardingTypeChange}
          onBack={resetToOverview}
          onNext={() => setConnectStep("customer")}
        />
      )}

      {flow === "connect" && connectStep === "customer" && (
        <ConnectCustomerStep
          customerNumber={customerNumber}
          onChange={setCustomerNumber}
          onBack={() => setConnectStep("type")}
          onNext={() => setConnectStep("code")}
        />
      )}

      {flow === "connect" && connectStep === "code" && (
        <ConnectCodeStep
          curaNumber={curaNumber}
          customerNumber={customerNumber}
          activateCode={activateCode}
          onBack={() => setConnectStep("customer")}
          onNext={() => setConnectStep("confirm")}
        />
      )}

      {flow === "connect" && connectStep === "confirm" && activePhoneId && (
        <ConnectConfirmStep
          confirming={confirming}
          onBack={() => setConnectStep("code")}
          onConfirm={() => onConfirmForwarding(activePhoneId, customerNumber)}
          onDone={resetToOverview}
        />
      )}

      {flow === "disconnect" && activePhone && (
        <PhoneBillingDetails phone={activePhone} />
      )}

      {flow === "disconnect" && disconnectStep === "code" && activePhone && (
        <DisconnectCodeStep
          customerNumber={activePhone.customerNumber}
          deactivateCode={deactivateCode}
          hint={forwardingDeactivateHint(activeForwardingType)}
          onBack={resetToOverview}
          onNext={() => setDisconnectStep("confirm")}
        />
      )}

      {flow === "disconnect" && disconnectStep === "confirm" && activePhoneId && (
        <DisconnectConfirmStep
          customerNumber={activePhone?.customerNumber}
          disconnecting={disconnecting}
          onBack={() => setDisconnectStep("code")}
          onConfirm={() => onDisconnect(activePhoneId)}
          onDone={resetToOverview}
        />
      )}
    </div>
  );
}

function PhoneBillingDetails({ phone }: { phone: UserPhoneNumberView }) {
  if (!phone.nextBillingAt) return null;

  const billingAmount = formatPhoneNumberBillingAmount();

  return (
    <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] px-4 py-3">
      <p className="font-mono text-[14px] font-normal text-[#0E121B]">
        {phone.phoneNumber}
      </p>
      <p className={`${userLabelClass} mt-2`}>
        Gültig bis: {formatBillingDateTime(phone.nextBillingAt)}
      </p>
      {billingAmount && (
        <p className={userLabelClass}>
          Nächste Abbuchung: {formatBillingDateTime(phone.nextBillingAt)} · {billingAmount}
        </p>
      )}
      {phone.pausedAt && (
        <p className="mt-1 text-[13px] text-amber-700">
          Pausiert — bitte Guthaben aufladen
        </p>
      )}
    </div>
  );
}

function OverviewStep({
  phase,
  numbers,
  pendingRequests,
  requesting,
  addingSip,
  onRequestNumber,
  onCancelRequest,
  onStartSip,
  onStartConnect,
  onStartDisconnect,
  onActivate,
  onRemove,
  canAffordPhoneNumber,
}: {
  phase: OnboardingPhase;
  numbers: UserPhoneNumberView[];
  pendingRequests: PendingPhoneRequestView[];
  requesting: boolean;
  addingSip: boolean;
  onRequestNumber: () => void;
  onCancelRequest: (requestId: string) => Promise<void>;
  onStartSip: () => void;
  onStartConnect: (phoneId: string) => void;
  onStartDisconnect: (phoneId: string) => void;
  onActivate: (phoneId: string) => Promise<void>;
  onRemove: (phoneId: string) => Promise<void>;
  canAffordPhoneNumber: boolean;
}) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [infoPhoneId, setInfoPhoneId] = useState<string | null>(null);

  const infoPhone = numbers.find((n) => n.id === infoPhoneId) ?? null;
  const hasPending = pendingRequests.length > 0;
  const isEmpty = numbers.length === 0 && !hasPending;

  return (
    <div className="space-y-4">
      <PhoneNumberInfoDialog
        phone={infoPhone}
        open={infoPhoneId !== null}
        onOpenChange={(open) => !open && setInfoPhoneId(null)}
      />
      {isEmpty && phase !== "nummer_warte" && (
        <div className="space-y-1">
          <p className={userLabelClass}>Noch keine Telefonnummer hinterlegt.</p>
          <p className={userLabelClass}>
            Cura-Nummer: {formatPhoneNumberCostLabel()}
          </p>
        </div>
      )}

      {(numbers.length > 0 || hasPending) && (
        <ul className="space-y-3">
          {pendingRequests.map((req) => (
            <li
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-2 py-1"
            >
              <div className="min-w-0">
                <p className="text-[14px] text-[#525866]">Nummer in Bearbeitung</p>
                <p className="text-[11px] text-[#525866]">Cura Nummer</p>
              </div>
              <button
                type="button"
                className={landingBtnGhost}
                disabled={cancellingId === req.id}
                onClick={async () => {
                  setCancellingId(req.id);
                  try {
                    await onCancelRequest(req.id);
                  } finally {
                    setCancellingId(null);
                  }
                }}
                aria-label="Anfrage zurückziehen"
              >
                {cancellingId === req.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </li>
          ))}

          {numbers.map((num) => {
            const isConnected = isPhoneLinked(num);
            const showCoupling = needsCoupling(num);
            return (
              <li
                key={num.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[14px] font-normal text-[#0E121B]">
                    {num.phoneNumber}
                  </p>
                  <p className="text-[11px] text-[#525866]">
                    {phoneListSubtitle(num, isConnected)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className={landingBtnGhost}
                    onClick={() => setInfoPhoneId(num.id)}
                    aria-label="Details zur Nummer"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  {showCoupling &&
                    (isConnected ? (
                      <button
                        type="button"
                        className={landingBtnSecondary}
                        onClick={() => onStartDisconnect(num.id)}
                      >
                        Entkoppeln
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={landingBtnPrimary}
                        onClick={() => onStartConnect(num.id)}
                      >
                        Koppeln
                      </button>
                    ))}
                  {!num.isPrimary && numbers.length > 1 && (
                    <button
                      type="button"
                      className={landingBtnSecondary}
                      disabled={activatingId === num.id}
                      onClick={async () => {
                        setActivatingId(num.id);
                        try {
                          await onActivate(num.id);
                        } finally {
                          setActivatingId(null);
                        }
                      }}
                    >
                      {activatingId === num.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Aktivieren
                    </button>
                  )}
                  {showCoupling && !isConnected && (
                    <button
                      type="button"
                      className={landingBtnGhost}
                      disabled={removingId === num.id}
                      onClick={async () => {
                        setRemovingId(num.id);
                        try {
                          await onRemove(num.id);
                        } finally {
                          setRemovingId(null);
                        }
                      }}
                      aria-label="Nummer entfernen"
                    >
                      {removingId === num.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-setup-demo="setup-demo-phone-request"
          className={landingBtnPrimary}
          onClick={onRequestNumber}
          disabled={requesting || hasPending || !canAffordPhoneNumber}
          title={
            !canAffordPhoneNumber
              ? `Mindestens ${formatPhoneNumberCostLabel()} erforderlich`
              : undefined
          }
        >
          {requesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Nummer beantragen
        </button>
        <button
          type="button"
          className={landingBtnSecondary}
          onClick={onStartSip}
          disabled={addingSip}
        >
          Eigene Nummer (SIP)
        </button>
      </div>
    </div>
  );
}

function ConnectCustomerStep({
  customerNumber,
  onChange,
  onBack,
  onNext,
}: {
  customerNumber: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className={userLabelClass}>
        Von welcher Nummer leiten Sie Anrufe weiter? Diese Nummer brauchen Sie
        später auch zum Entkoppeln.
      </p>
      <div className="space-y-2">
        <Label className={userLabelClass}>Ihre Telefonnummer</Label>
        <Input
          value={customerNumber}
          onChange={(e) => onChange(e.target.value)}
          placeholder="+41791234567"
        />
      </div>
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Weiter"
        nextDisabled={!customerNumber.trim()}
      />
    </div>
  );
}

function SipTrunkStep({
  phoneNumber,
  label,
  outboundAddress,
  adding,
  onPhoneNumberChange,
  onLabelChange,
  onAddressChange,
  onBack,
  onSubmit,
}: {
  phoneNumber: string;
  label: string;
  outboundAddress: string;
  adding: boolean;
  onPhoneNumberChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <p className={userLabelClass}>
        Eigene Nummer als SIP Trunk hinzufügen. Die Nummer wird bei ElevenLabs
        importiert und auf Bot-Anrufe geprüft — nur SIP-kompatible Nummern
        werden übernommen. Ein Telefonagent muss bereits existieren.
      </p>
      <div className="space-y-2">
        <Label className={userLabelClass}>Telefonnummer (E.164)</Label>
        <Input
          value={phoneNumber}
          onChange={(e) => onPhoneNumberChange(e.target.value)}
          placeholder="+41791234567"
        />
      </div>
      <div className="space-y-2">
        <Label className={userLabelClass}>Bezeichnung (optional)</Label>
        <Input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Hauptleitung"
        />
      </div>
      <div className="space-y-2">
        <Label className={userLabelClass}>SIP-Adresse (optional, für ausgehend)</Label>
        <Input
          value={outboundAddress}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="sip.provider.ch"
        />
      </div>
      <StepNav
        onBack={onBack}
        onNext={() => void onSubmit()}
        nextLabel="Prüfen & hinzufügen"
        nextDisabled={adding || !phoneNumber.trim()}
        nextLoading={adding}
      />
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
    <div className="space-y-3">
      <p className={userLabelClass}>
        Koppeln Sie Ihre Handynummer mit der Cura-Nummer: Wählen Sie den
        Weiterleitungstyp und folgen Sie den nächsten Schritten.
      </p>
      <p className={userLabelClass}>Weiterleitungstyp</p>
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
  customerNumber,
  activateCode,
  onBack,
  onNext,
}: {
  curaNumber: string;
  customerNumber: string;
  activateCode: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className={userLabelClass}>
        Wählen Sie auf <strong>{customerNumber}</strong> den Code und drücken Sie
        die Anruftaste.
      </p>
      <CopyRow label="Cura-Nummer" value={curaNumber} mono />
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
    <div className="space-y-3">
      <p className={userLabelClass}>Weiterleitung eingerichtet?</p>
      <StepNav
        onBack={onBack}
        onNext={async () => {
          const ok = await onConfirm();
          if (ok) onDone();
        }}
        nextLabel="Koppeln bestätigen"
        nextDisabled={confirming}
        nextLoading={confirming}
      />
    </div>
  );
}

function DisconnectCodeStep({
  customerNumber,
  deactivateCode,
  hint,
  onBack,
  onNext,
}: {
  customerNumber?: string;
  deactivateCode: string;
  hint: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className={userLabelClass}>
        {customerNumber
          ? `Deaktivieren Sie die Weiterleitung auf ${customerNumber}.`
          : "Deaktivieren Sie die Weiterleitung auf Ihrer Telefonnummer."}
      </p>
      <p className="text-[12px] text-[#525866]">{hint}</p>
      <CopyRow label="Code" value={deactivateCode} mono />
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Weiter" />
    </div>
  );
}

function DisconnectConfirmStep({
  customerNumber,
  disconnecting,
  onBack,
  onConfirm,
  onDone,
}: {
  customerNumber?: string;
  disconnecting: boolean;
  onBack: () => void;
  onConfirm: () => Promise<boolean>;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className={userLabelClass}>
        {customerNumber
          ? `Weiterleitung auf ${customerNumber} deaktiviert?`
          : "Weiterleitung deaktiviert?"}
      </p>
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
      <button type="button" className={landingBtnSecondary} onClick={onBack}>
        Zurück
      </button>
      <button
        type="button"
        className={nextVariant === "outline" ? landingBtnSecondary : landingBtnPrimary}
        onClick={() => void onNext()}
        disabled={nextDisabled}
      >
        {nextLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {nextLabel}
      </button>
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
      className={`rounded px-3 py-1.5 text-[12px] font-normal transition-colors ${
        active ? "bg-[#050f1f] text-white" : "border border-[#E1E4EA] bg-[#F5F7FA] text-[#525866]"
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
      <p className="text-[11px] font-normal text-[#525866]">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <div
          className={`min-w-0 flex-1 truncate rounded border border-[#E1E4EA] bg-[#F5F7FA] px-3 py-2 ${
            mono ? "font-mono text-[13px]" : "text-[14px]"
          }`}
        >
          {value}
        </div>
        <button type="button" className={landingBtnGhost} onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
