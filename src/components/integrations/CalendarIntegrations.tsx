"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

type Provider = "google" | "microsoft" | "apple";

interface CalStatus {
  provider: Provider;
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
}

const META: Record<
  Provider,
  { name: string; initials: string; description: string }
> = {
  google: {
    name: "Google Kalender",
    initials: "G",
    description: "Termine und Besichtigungen direkt in Google Calendar eintragen.",
  },
  microsoft: {
    name: "Microsoft Outlook",
    initials: "O",
    description: "Termine in Outlook / Microsoft 365 über Microsoft Graph anlegen.",
  },
  apple: {
    name: "Apple Kalender (iCloud)",
    initials: "A",
    description: "iCloud-Kalender mit einem App-Passwort in Sekunden verbinden.",
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Für diesen Anbieter fehlen die OAuth-Zugangsdaten in der .env.",
  denied: "Die Autorisierung wurde abgebrochen.",
  state_mismatch: "Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.",
  exchange_failed: "Der Token-Austausch ist fehlgeschlagen.",
  unknown_provider: "Unbekannter Anbieter.",
};

export function CalendarIntegrations() {
  const [statuses, setStatuses] = useState<CalStatus[] | null>(null);
  const [dialogProvider, setDialogProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (res.ok && data.ok) setStatuses(data.calendars as CalStatus[]);
    } catch {
      toast.error("Status konnte nicht geladen werden");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Surface the OAuth redirect result, then clean the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get("connected");
    const error = p.get("error");
    if (connected) {
      toast.success(`${META[connected as Provider]?.name ?? connected} verbunden`);
    } else if (error) {
      toast.error("Verbindung fehlgeschlagen", {
        description: ERROR_MESSAGES[error] ?? error,
      });
    }
    if (connected || error) {
      window.history.replaceState({}, "", "/telefonagent");
    }
  }, []);

  async function disconnect(provider: Provider) {
    setBusy(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(`${META[provider].name} getrennt`);
        await load();
      } else {
        toast.error("Trennen fehlgeschlagen");
      }
    } finally {
      setBusy(null);
    }
  }

  if (!statuses) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-card" />
        ))}
      </div>
    );
  }

  const active = statuses.find((s) => s.provider === dialogProvider) ?? null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {statuses.map((s) => (
          <ProviderCard
            key={s.provider}
            status={s}
            busy={busy === s.provider}
            onConnect={() => setDialogProvider(s.provider)}
            onDisconnect={() => disconnect(s.provider)}
          />
        ))}
      </div>

      <ConnectDialog
        status={active}
        onClose={() => setDialogProvider(null)}
        onConnected={async () => {
          setDialogProvider(null);
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
  const meta = META[status.provider];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-navy text-[16px] font-semibold text-white">
            {meta.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-h3 text-navy">{meta.name}</h3>
                <p className="mt-1 text-body text-text-muted">
                  {meta.description}
                </p>
              </div>
              <StatusBadge connected={status.connected} />
            </div>

            {status.connected && status.accountLabel && (
              <p className="mt-2 text-caption text-text-muted">
                Verbunden als{" "}
                <span className="font-medium text-text">
                  {status.accountLabel}
                </span>
              </p>
            )}

            <div className="mt-3">
              {status.connected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onDisconnect}
                  disabled={busy}
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Trennen
                </Button>
              ) : (
                <Button size="sm" onClick={onConnect}>
                  <Calendar className="mr-2 h-4 w-4 stroke-[1.5]" />
                  Verbinden
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-btn border px-2 py-0.5 text-caption font-medium",
        connected
          ? "border-blue-tint bg-baby-blue text-steel-blue"
          : "border-stroke bg-bg text-text-muted"
      )}
    >
      {connected ? "Verbunden" : "Nicht verbunden"}
    </span>
  );
}

/** A compact numbered step row used inside the connect dialog. */
function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
        {n}
      </span>
      <span className="pt-0.5 text-body text-text">{children}</span>
    </li>
  );
}

function ConnectDialog({
  status,
  onClose,
  onConnected,
}: {
  status: CalStatus | null;
  onClose: () => void;
  onConnected: () => void;
}) {
  const provider = status?.provider ?? null;
  return (
    <Dialog open={!!provider} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {provider === "apple" ? (
          <AppleGuide onConnected={onConnected} />
        ) : provider ? (
          <OAuthGuide status={status!} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OAuthGuide({ status }: { status: CalStatus }) {
  const provider = status.provider as "google" | "microsoft";
  const name = META[provider].name;
  const signInLabel =
    provider === "google" ? "Mit Google anmelden" : "Mit Microsoft anmelden";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{name} verbinden</DialogTitle>
        <DialogDescription>In zwei Schritten verbunden.</DialogDescription>
      </DialogHeader>

      <ol className="space-y-3 py-1">
        <GuideStep n={1}>
          Klicken Sie auf «{signInLabel}» und wählen Sie Ihr Konto.
        </GuideStep>
        <GuideStep n={2}>
          Bestätigen Sie den Kalenderzugriff — danach sind Sie verbunden.
        </GuideStep>
      </ol>

      {!status.configured && (
        <p className="flex items-start gap-2 rounded-btn bg-amber-50 p-3 text-caption text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
          Die {name}-Anbindung muss vom Administrator einmalig in der{" "}
          <code>.env</code> aktiviert werden.
        </p>
      )}

      <Button
        className="mt-1 w-full"
        disabled={!status.configured}
        onClick={() => {
          window.location.href = `/api/integrations/${provider}/connect`;
        }}
      >
        {signInLabel}
      </Button>
    </>
  );
}

function AppleGuide({ onConnected }: { onConnected: () => void }) {
  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);

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
    <>
      <DialogHeader>
        <DialogTitle>Apple Kalender verbinden</DialogTitle>
        <DialogDescription>
          Apple verlangt ein einmaliges App-Passwort.
        </DialogDescription>
      </DialogHeader>

      <ol className="space-y-3 py-1">
        <GuideStep n={1}>
          <a
            href="https://account.apple.com/account/manage"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-accent underline"
          >
            App-Passwort erstellen
            <ExternalLink className="h-3.5 w-3.5" />
          </a>{" "}
          → «Anmeldung & Sicherheit» → «App-spezifische Passwörter».
        </GuideStep>
        <GuideStep n={2}>Apple-ID und das Passwort unten eingeben.</GuideStep>
      </ol>

      <div className="space-y-3 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="apple-id">Apple-ID (E-Mail)</Label>
          <Input
            id="apple-id"
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
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
      </div>

      <Button className="mt-1 w-full" onClick={submit} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Verbinden
      </Button>
    </>
  );
}
