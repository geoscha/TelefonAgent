"use client";

import { ExternalLink } from "lucide-react";

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
import { cn } from "@/lib/utils";

export type GoogleOAuthKind = "calendar" | "gmail";

const COPY: Record<
  GoogleOAuthKind,
  { title: string; intro: string; steps: string[]; connectLabel: string }
> = {
  calendar: {
    title: "Google Kalender verbinden",
    intro:
      "Melden Sie sich mit Ihrem persönlichen Google-Konto an (z. B. @gmail.com). Cura erhält Zugriff nur auf Ihren Kalender — nicht auf andere Google-Dienste.",
    steps: [
      "Klicken Sie auf «Mit Google anmelden».",
      "Wählen Sie Ihr Google-Konto oder melden Sie sich an.",
      "Bestätigen Sie den Kalender-Zugriff für Cura.",
      "Sie werden zurück zu Cura geleitet — der Kalender ist verbunden.",
    ],
    connectLabel: "Mit Google anmelden",
  },
  gmail: {
    title: "Gmail verbinden",
    intro:
      "Melden Sie sich mit Ihrem persönlichen Google-Konto an (z. B. @gmail.com). Cura kann dann E-Mails in Ihrem Namen lesen und senden.",
    steps: [
      "Klicken Sie auf «Mit Google anmelden».",
      "Wählen Sie Ihr Google-Konto oder melden Sie sich an.",
      "Bestätigen Sie den Gmail-Zugriff für Cura.",
      "Sie werden zurück zu Cura geleitet — Gmail erscheint unter «Nachrichten».",
    ],
    connectLabel: "Mit Google anmelden",
  },
};

export function GoogleOAuthConnectDialog({
  kind,
  open,
  onOpenChange,
  connectHref,
}: {
  kind: GoogleOAuthKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectHref: string;
}) {
  const copy = COPY[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.intro}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-2.5">
          {copy.steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-[13px] text-[#0E121B]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBEEF4] text-[11px] font-medium text-[#335cff]">
                {index + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <p className="rounded border border-[#E1E4EA] bg-[#F5F7FA] px-3 py-2.5 text-[12px] text-[#525866]">
          Google Kalender und Gmail sind getrennte Verbindungen. Sie können beide
          mit demselben Google-Konto verknüpfen.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={cn(landingBtnSecondary, "flex-1 justify-center")}
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </button>
          <a
            href={connectHref}
            className={cn(landingBtnPrimary, "flex-1 justify-center no-underline")}
          >
            {copy.connectLabel}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
