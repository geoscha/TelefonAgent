"use client";

import { IntegrationLogoTile } from "@/components/integrations/IntegrationLogoTile";
import { GoogleOAuthConnectDialog } from "@/components/integrations/GoogleOAuthConnectDialog";
import { CALENDAR_LOGOS } from "@/lib/integrations/integration-logos";
import { matchesIntegrationSearch } from "@/lib/integrations/search";
import {
  compareConnectedThenName,
  type IntegrationCardEntry,
} from "@/lib/integrations/sort";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnPrimary,
  landingBtnSecondary,
  landingIntegrationCardBtn,
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
import {
  CALENDAR_PROVIDERS,
  PROVIDER_META,
  type CalendarProviderId,
} from "@/lib/calendar/provider-meta";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface CalStatus {
  provider: CalendarProviderId;
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
}

const APPLE_LINKS = {
  account: "https://account.apple.com/account/manage",
  appPasswordHelp: "https://support.apple.com/de-de/102654",
  twoFactorHelp: "https://support.apple.com/de-de/102660",
} as const;

export function CalendarIntegrations({
  layout = "compact",
  bare = false,
  searchQuery = "",
  registerCards,
  deferCardRender = false,
}: {
  layout?: "compact" | "page";
  bare?: boolean;
  searchQuery?: string;
  registerCards?: (cards: IntegrationCardEntry[]) => void;
  deferCardRender?: boolean;
}) {
  const [statuses, setStatuses] = useState<CalStatus[] | null>(null);
  const [appleDialogOpen, setAppleDialogOpen] = useState(false);
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<CalendarProviderId | null>(
    null
  );
  const [busyProvider, setBusyProvider] = useState<CalendarProviderId | null>(
    null
  );

  async function load() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (res.status === 401) {
        setStatuses(
          CALENDAR_PROVIDERS.map((provider) => ({
            provider,
            connected: false,
            configured: provider === "apple",
          }))
        );
        return;
      }
      if (res.ok && data.ok) {
        const incoming = (data.calendars ?? []) as CalStatus[];
        setStatuses(
          CALENDAR_PROVIDERS.map((provider) => {
            const found = incoming.find((entry) => entry.provider === provider);
            return (
              found ?? {
                provider,
                connected: false,
                configured: provider === "apple",
              }
            );
          })
        );
      }
    } catch {
      toast.error("Status konnte nicht geladen werden");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeProvider = useMemo(
    () => statuses?.find((entry) => entry.connected)?.provider ?? null,
    [statuses]
  );

  const sortedStatuses = useMemo(() => {
    if (!statuses) return [];

    return [...statuses].sort((a, b) =>
      compareConnectedThenName(
        { connected: a.connected, name: PROVIDER_META[a.provider].name },
        { connected: b.connected, name: PROVIDER_META[b.provider].name }
      )
    );
  }, [statuses]);

  async function disconnect(provider: CalendarProviderId) {
    setBusyProvider(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(`${PROVIDER_META[provider].name} getrennt`);
        await load();
      } else {
        toast.error("Trennen fehlgeschlagen");
      }
    } finally {
      setBusyProvider(null);
    }
  }

  function startOAuthConnect(provider: "google" | "microsoft") {
    window.location.href = `/api/integrations/${provider}/connect`;
  }

  function requestConnect(provider: CalendarProviderId) {
    if (activeProvider && activeProvider !== provider) {
      setSwitchTarget(provider);
      return;
    }
    if (provider === "apple") {
      setAppleDialogOpen(true);
      return;
    }
    if (provider === "google") {
      setGoogleDialogOpen(true);
      return;
    }
    startOAuthConnect(provider);
  }

  async function confirmSwitch() {
    if (!switchTarget || !activeProvider) return;
    setBusyProvider(activeProvider);
    try {
      await disconnect(activeProvider);
      setSwitchTarget(null);
      if (switchTarget === "apple") {
        setAppleDialogOpen(true);
      } else if (switchTarget === "google") {
        setGoogleDialogOpen(true);
      } else {
        startOAuthConnect(switchTarget);
      }
    } finally {
      setBusyProvider(null);
    }
  }

  const filteredStatuses = useMemo(() => {
    if (!statuses) return [];

    return sortedStatuses.filter((status) => {
      const meta = PROVIDER_META[status.provider];
      return matchesIntegrationSearch(searchQuery, {
        category: "calendar",
        id: status.provider,
        name: meta.name,
        description: meta.description,
        extra: status.accountLabel,
      });
    });
  }, [sortedStatuses, searchQuery, statuses]);

  const cardEntries = useMemo(
    () =>
      filteredStatuses.map((status) => ({
        key: `calendar:${status.provider}`,
        name: PROVIDER_META[status.provider].name,
        connected: status.connected,
        node: (
          <ProviderCard
            key={status.provider}
            status={status}
            isActive={status.provider === activeProvider}
            busy={busyProvider === status.provider}
            embedded={layout === "page"}
            onConnect={() => requestConnect(status.provider)}
            onDisconnect={() => void disconnect(status.provider)}
          />
        ),
      })),
    [filteredStatuses, activeProvider, busyProvider, layout]
  );

  useEffect(() => {
    registerCards?.(cardEntries);
  }, [cardEntries, registerCards]);

  const cards = cardEntries.map((entry) => entry.node);
  const showCardsInline = !deferCardRender;

  if (!statuses) {
    return <Skeleton className="h-48 w-full rounded" />;
  }

  if (filteredStatuses.length === 0) {
    return (
      <>
        <SwitchCalendarDialog
          open={switchTarget !== null}
          currentProvider={activeProvider}
          targetProvider={switchTarget}
          busy={busyProvider !== null}
          onCancel={() => setSwitchTarget(null)}
          onConfirm={() => void confirmSwitch()}
        />

        <GoogleOAuthConnectDialog
          kind="calendar"
          open={googleDialogOpen}
          onOpenChange={setGoogleDialogOpen}
          connectHref="/api/integrations/google/connect"
        />

        <AppleConnectDialog
          open={appleDialogOpen}
          onOpenChange={setAppleDialogOpen}
          onConnected={async () => {
            setAppleDialogOpen(false);
            await load();
          }}
        />
      </>
    );
  }

  return (
    <>
      {showCardsInline &&
        (bare ? (
          cards
        ) : (
          <div className={cn("space-y-3", layout === "page" ? "w-full" : "max-w-md")}>
            {cards}
          </div>
        ))}

      <SwitchCalendarDialog
        open={switchTarget !== null}
        currentProvider={activeProvider}
        targetProvider={switchTarget}
        busy={busyProvider !== null}
        onCancel={() => setSwitchTarget(null)}
        onConfirm={() => void confirmSwitch()}
      />

      <GoogleOAuthConnectDialog
        kind="calendar"
        open={googleDialogOpen}
        onOpenChange={setGoogleDialogOpen}
        connectHref="/api/integrations/google/connect"
      />

      <AppleConnectDialog
        open={appleDialogOpen}
        onOpenChange={setAppleDialogOpen}
        onConnected={async () => {
          setAppleDialogOpen(false);
          await load();
        }}
      />
    </>
  );
}

const PROVIDER_LOGOS = CALENDAR_LOGOS;

function ProviderLogo({ provider }: { provider: CalendarProviderId }) {
  const logo = PROVIDER_LOGOS[provider];

  return (
    <IntegrationLogoTile
      src={logo.src}
      width={logo.width}
      height={logo.height}
      fit="contain"
    />
  );
}

function ProviderCard({
  status,
  isActive,
  busy,
  onConnect,
  onDisconnect,
  embedded = false,
}: {
  status: CalStatus;
  isActive: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  embedded?: boolean;
}) {
  const meta = PROVIDER_META[status.provider];
  const unavailable = !status.configured;

  return (
    <div
      className={cn(
        embedded
          ? cn(
              "w-full rounded-lg border p-4 sm:p-5",
              isActive
                ? "border-[#335cff]/30 bg-[#F8FAFF]"
                : "border-[#E1E4EA] bg-[#FAFAFA]"
            )
          : cn(userPanelClass, "w-full")
      )}
    >
      <div className={embedded ? undefined : "p-5 sm:p-6"}>
        <div className="flex w-full items-center gap-4 sm:gap-5">
          <ProviderLogo provider={status.provider} />
          <div className="min-w-0 flex-1">
            <h3 className={userTitleClass}>{meta.name}</h3>
            <p className={`${userLabelClass} mt-1`}>{meta.description}</p>
            {status.connected && status.accountLabel ? (
              <p className={`${userLabelClass} mt-2`}>
                Verbunden als{" "}
                <span className="text-[#0E121B]">{status.accountLabel}</span>
              </p>
            ) : null}
            {unavailable ? (
              <p className="mt-2 text-[12px] text-[#99A0AE]">
                Derzeit nicht verfügbar — Google OAuth ist auf dieser Instanz
                noch nicht eingerichtet.
              </p>
            ) : null}
          </div>
          <div className="shrink-0">
            {status.connected ? (
              <button
                type="button"
                className={cn(landingBtnSecondary, landingIntegrationCardBtn)}
                onClick={onDisconnect}
                disabled={busy}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Trennen
              </button>
            ) : (
              <button
                type="button"
                className={cn(landingBtnPrimary, landingIntegrationCardBtn)}
                onClick={onConnect}
                disabled={unavailable || busy}
              >
                Verbinden
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchCalendarDialog({
  open,
  currentProvider,
  targetProvider,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  currentProvider: CalendarProviderId | null;
  targetProvider: CalendarProviderId | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!currentProvider || !targetProvider) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kalender wechseln?</DialogTitle>
          <DialogDescription>
            Es kann nur ein Kalender gleichzeitig verbunden sein.{" "}
            <span className="font-medium text-[#0E121B]">
              {PROVIDER_META[currentProvider].name}
            </span>{" "}
            wird getrennt, danach verbinden Sie{" "}
            <span className="font-medium text-[#0E121B]">
              {PROVIDER_META[targetProvider].name}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={cn(landingBtnSecondary, "flex-1 justify-center")}
            onClick={onCancel}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className={cn(landingBtnPrimary, "flex-1 justify-center")}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Wechseln
          </button>
        </div>
      </DialogContent>
    </Dialog>
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
                Passwort (z. B. «Linker»).{" "}
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
