"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

interface CalStatus {
  provider: "apple";
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
}

const APPLE_META = {
  name: "Apple Kalender (iCloud)",
  description: "Termine direkt in Ihren iCloud-Kalender eintragen.",
};

const APPLE_LINKS = {
  account: "https://account.apple.com/account/manage",
  appPasswordHelp:
    "https://support.apple.com/de-de/102654",
  twoFactorHelp:
    "https://support.apple.com/de-de/102660",
} as const;

export function CalendarIntegrations() {
  const [status, setStatus] = useState<CalStatus | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (res.ok && data.ok) {
        const calendars = data.calendars as CalStatus[];
        const apple =
          calendars.find((entry) => entry.provider === "apple") ?? {
            provider: "apple" as const,
            connected: false,
            configured: false,
          };
        setStatus(apple);
      }
    } catch {
      toast.error("Status konnte nicht geladen werden");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/apple/disconnect", {
        method: "POST",
      });
      if (res.ok) {
        toast.success(`${APPLE_META.name} getrennt`);
        await load();
      } else {
        toast.error("Trennen fehlgeschlagen");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <Skeleton className="h-40 w-full max-w-md rounded" />;
  }

  return (
    <>
      <div className="max-w-md">
        <ProviderCard
          status={status}
          busy={busy}
          onConnect={() => setConnectOpen(true)}
          onDisconnect={() => void disconnect()}
        />
      </div>

      <AppleConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={async () => {
          setConnectOpen(false);
          await load();
        }}
      />
    </>
  );
}

function ProviderCard({
  status,
  busy,
  onConnect,
  onDisconnect,
}: {
  status: CalStatus;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className={userPanelClass}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className={userTitleClass}>{APPLE_META.name}</h3>
            <p className={`${userLabelClass} mt-1`}>{APPLE_META.description}</p>
          </div>
          {status.connected ? <ConnectedBadge /> : null}
        </div>

        {status.connected && status.accountLabel ? (
          <p className={`${userLabelClass} mt-2`}>
            Verbunden als{" "}
            <span className="text-[#0E121B]">{status.accountLabel}</span>
          </p>
        ) : null}

        <div className="mt-3">
          {status.connected ? (
            <button
              type="button"
              className={landingBtnSecondary}
              onClick={onDisconnect}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Trennen
            </button>
          ) : (
            <button
              type="button"
              className={landingBtnPrimary}
              onClick={onConnect}
            >
              Verbinden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectedBadge() {
  return (
    <span className="shrink-0 rounded border border-[#335cff]/20 bg-[#EBEEF4] px-2 py-0.5 text-[12px] font-normal text-[#335cff]">
      Verbunden
    </span>
  );
}

function DocLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-[#335cff] underline underline-offset-2 hover:text-[#2547d4]"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function AppleConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const [step, setStep] = useState<"guide" | "credentials">("guide");
  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("guide");
      setAppleId("");
      setAppPassword("");
    }
  }, [open]);

  async function submit() {
    if (!appleId.trim() || !appPassword.trim()) {
      toast.error("Bitte Apple-ID und App-Passwort angeben.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/apple/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appleId, appPassword }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Apple Kalender verbunden");
        onConnected();
      } else {
        toast.error("Verbindung fehlgeschlagen", { description: data.error });
      }
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apple Kalender verbinden</DialogTitle>
          <DialogDescription>
            {step === "guide"
              ? "In zwei Schritten — dauert etwa eine Minute."
              : "Tragen Sie Ihre Apple-ID und das App-Passwort ein."}
          </DialogDescription>
        </DialogHeader>

        {step === "guide" ? (
          <div className="space-y-4">
            <ol className="space-y-3">
              <GuideStep n={1}>
                Öffnen Sie Ihr{" "}
                <DocLink href={APPLE_LINKS.account}>Apple-Konto</DocLink> und
                gehen Sie zu «Anmeldung & Sicherheit».
              </GuideStep>
              <GuideStep n={2}>
                Erstellen Sie unter «App-spezifische Passwörter» ein neues
                Passwort (z. B. «Cura»).{" "}
                <DocLink href={APPLE_LINKS.appPasswordHelp}>
                  Anleitung von Apple
                </DocLink>
              </GuideStep>
              <GuideStep n={3}>
                Kopieren Sie das Passwort — es wird nur einmal angezeigt.
              </GuideStep>
            </ol>

            <p className="rounded border border-[#E1E4EA] bg-[#F5F7FA] px-3 py-2.5 text-[12px] text-[#525866]">
              Voraussetzung:{" "}
              <DocLink href={APPLE_LINKS.twoFactorHelp}>
                Zwei-Faktor-Authentifizierung
              </DocLink>{" "}
              muss für Ihre Apple-ID aktiv sein.
            </p>

            <a
              href={APPLE_LINKS.account}
              target="_blank"
              rel="noreferrer"
              className={cn(
                landingBtnPrimary,
                "w-full justify-center no-underline"
              )}
            >
              App-Passwort bei Apple erstellen
              <ExternalLink className="h-4 w-4" />
            </a>

            <button
              type="button"
              className={cn(landingBtnSecondary, "w-full justify-center")}
              onClick={() => setStep("credentials")}
            >
              App-Passwort erstellt — weiter
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="apple-id">Apple-ID (E-Mail)</Label>
                <Input
                  id="apple-id"
                  type="email"
                  autoComplete="username"
                  placeholder="name@icloud.com"
                  value={appleId}
                  onChange={(e) => setAppleId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apple-pw">App-spezifisches Passwort</Label>
                <Input
                  id="apple-pw"
                  type="password"
                  autoComplete="off"
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </div>
            </div>

            <p className="text-[12px] text-[#99A0AE]">
              Ihr normales Apple-Passwort funktioniert hier nicht — nur das
              App-Passwort.{" "}
              <DocLink href={APPLE_LINKS.appPasswordHelp}>
                Hilfe von Apple
              </DocLink>
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className={cn(landingBtnSecondary, "flex-1 justify-center")}
                onClick={() => setStep("guide")}
                disabled={saving}
              >
                Zurück
              </button>
              <button
                type="button"
                className={cn(landingBtnPrimary, "flex-1 justify-center")}
                onClick={() => void submit()}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Verbinden
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[13px] text-[#0E121B]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBEEF4] text-[11px] font-medium text-[#335cff]">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}
