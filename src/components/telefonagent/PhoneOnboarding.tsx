"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { OnboardingPhase } from "@/lib/onboarding-types";

type ForwardingType = "alle" | "bedingt";

interface PhoneOnboardingProps {
  phase: OnboardingPhase;
  linkerNumber: string;
  forwardingInstructions?: string;
  forwardingType: ForwardingType;
  onForwardingTypeChange: (v: ForwardingType) => void;
  requesting: boolean;
  confirming: boolean;
  onRequestNumber: () => void;
  onConfirmForwarding: () => void;
}

export function PhoneOnboarding({
  phase,
  linkerNumber,
  forwardingInstructions,
  forwardingType,
  onForwardingTypeChange,
  requesting,
  confirming,
  onRequestNumber,
  onConfirmForwarding,
}: PhoneOnboardingProps) {
  if (phase === "fertig" || phase === "agent") return null;

  const linkerCode = linkerNumber.replace(/[\s()./-]/g, "");
  const overflowCode = linkerCode ? `**61*${linkerCode}#` : "";
  const allCallsCode = linkerCode ? `**21*${linkerCode}#` : "";
  const activeCode =
    forwardingType === "alle" ? allCallsCode : overflowCode;

  return (
    <div className="rounded-card border border-stroke bg-surface p-5">
      <p className="font-medium text-navy">Telefonnummer verbinden</p>

      {phase === "nummer_anfragen" && (
        <div className="mt-4 space-y-3">
          <p className="text-body text-text-muted">
            Beantragen Sie eine dedizierte Linker-Weiterleitungsnummer. Wir
            richten diese für Sie ein und melden uns, sobald sie bereit ist.
          </p>
          <Button size="sm" onClick={onRequestNumber} disabled={requesting}>
            {requesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Nummer beantragen
          </Button>
        </div>
      )}

      {phase === "nummer_warte" && (
        <div className="mt-4 rounded-btn border border-stroke bg-bg/50 p-4">
          <p className="font-medium text-navy">In Bearbeitung</p>
          <p className="mt-1 text-body text-text-muted">
            Ihre Nummer wird eingerichtet. Das kann einige Stunden dauern.
            Sobald die Nummer bereit ist, erscheint hier die Anleitung zur
            Weiterleitung.
          </p>
        </div>
      )}

      {phase === "weiterleitung" && (
        <div className="mt-4 space-y-4 rounded-btn border border-stroke bg-bg/50 p-4">
          <div>
            <p className="text-caption font-medium text-text-muted">
              Ihre Linker-Nummer
            </p>
            <p className="mt-1 font-mono text-h3 text-navy">
              {linkerNumber || "—"}
            </p>
            <p className="mt-2 text-body text-text-muted">
              Richten Sie die Weiterleitung Ihrer Geschäftsnummer auf diese
              Nummer ein.
            </p>
          </div>

          <div className="border-t border-stroke pt-4">
            <p className="text-caption font-medium text-text-muted">
              Weiterleitungstyp
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <TypeButton
                active={forwardingType === "bedingt"}
                onClick={() => onForwardingTypeChange("bedingt")}
                label="Nur Überlauf"
              />
              <TypeButton
                active={forwardingType === "alle"}
                onClick={() => onForwardingTypeChange("alle")}
                label="Alle Anrufe"
              />
            </div>
            <div className="mt-3 rounded-btn bg-baby-blue/40 p-3 text-caption text-text">
              <p>
                <strong>Nur Überlauf:</strong> Anrufe werden weitergeleitet, wenn
                Sie nicht erreichbar sind oder besetzt ist.{" "}
                <strong>Alle Anrufe:</strong> Jeder Anruf geht direkt an Linker —
                Ihr Handy klingelt nicht mehr.
              </p>
            </div>
          </div>

          {activeCode && (
            <div className="border-t border-stroke pt-4">
              <p className="text-caption font-medium text-text-muted">
                Code für Ihr Handy
              </p>
              <CopyRow value={activeCode} mono className="mt-2" />
            </div>
          )}

          {forwardingInstructions && (
            <div className="border-t border-stroke pt-4">
              <p className="text-caption font-medium text-text-muted">
                Anleitung
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-btn border border-stroke bg-surface p-3 font-sans text-body text-text">
                {forwardingInstructions}
              </pre>
            </div>
          )}

          <div className="border-t border-stroke pt-4">
            <p className="text-body text-text-muted">
              Haben Sie die Weiterleitung eingerichtet? Bestätigen Sie hier,
              damit Sie Ihren Telefonagenten konfigurieren können.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={onConfirmForwarding}
              disabled={confirming || !linkerNumber}
            >
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Weiterleitung eingerichtet — OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
        active ? "bg-accent text-white" : "bg-surface text-text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function CopyRow({
  value,
  mono,
  className,
}: {
  value: string;
  mono?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Kopiert");
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div
        className={`min-w-0 flex-1 truncate rounded-btn border border-stroke bg-surface px-3 py-2 ${
          mono ? "font-mono text-caption" : "text-body"
        }`}
      >
        {value}
      </div>
      <Button variant="outline" size="sm" onClick={copy} aria-label="Kopieren">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
