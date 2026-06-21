"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Loader2, RefreshCw } from "lucide-react";
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
import { WEBSITE_INTEGRATION_META } from "@/lib/integrations/website/provider-meta";
import { matchesIntegrationSearch } from "@/lib/integrations/search";
import { type IntegrationCardEntry } from "@/lib/integrations/sort";
import { cn } from "@/lib/utils";

interface WebsiteStatus {
  connected: boolean;
  url?: string;
  accountLabel?: string;
  pagesScraped?: number;
  lastSyncedAt?: string;
  syncStatus?: "pending" | "ok" | "error";
  syncError?: string;
  connectedAt?: string;
}

function formatSyncedAt(value?: string): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("de-CH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export function WebsiteIntegrations({
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
  const [status, setStatus] = useState<WebsiteStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (res.ok && data.ok && data.website) {
        setStatus(data.website as WebsiteStatus);
      } else {
        setStatus({ connected: false });
      }
    } catch {
      setStatus({ connected: false });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    return matchesIntegrationSearch(searchQuery, {
      category: "website",
      id: WEBSITE_INTEGRATION_META.id,
      name: WEBSITE_INTEGRATION_META.name,
      description: WEBSITE_INTEGRATION_META.description,
    });
  }, [searchQuery]);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/website/disconnect", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Website getrennt");
        await load();
      } else {
        toast.error(data.error ?? "Trennen fehlgeschlagen");
      }
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setRefreshBusy(true);
    try {
      const res = await fetch("/api/integrations/website/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Website-Wissen aktualisiert");
        setStatus(data.website as WebsiteStatus);
      } else {
        toast.error(data.error ?? "Aktualisierung fehlgeschlagen");
      }
    } finally {
      setRefreshBusy(false);
    }
  }

  const cardEntries = useMemo(() => {
    if (!status || !visible) return [];

    return [
      {
        key: "website:operator",
        name: WEBSITE_INTEGRATION_META.name,
        connected: status.connected,
        node: (
          <WebsiteCard
            status={status}
            busy={busy}
            refreshBusy={refreshBusy}
            embedded={layout === "page"}
            onConnect={() => setDialogOpen(true)}
            onDisconnect={() => void disconnect()}
            onRefresh={() => void refresh()}
          />
        ),
      },
    ];
  }, [status, visible, busy, refreshBusy, layout]);

  useEffect(() => {
    registerCards?.(cardEntries);
  }, [cardEntries, registerCards]);

  const cards = cardEntries.map((entry) => entry.node);
  const showCardsInline = !deferCardRender;

  if (!status) {
    return <Skeleton className="h-32 w-full rounded" />;
  }

  if (!visible) return null;

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

      <ConnectDialog
        open={dialogOpen}
        initialUrl={status.url ?? ""}
        onOpenChange={setDialogOpen}
        onConnected={async () => {
          setDialogOpen(false);
          await load();
        }}
      />
    </>
  );
}

function WebsiteCard({
  status,
  busy,
  refreshBusy,
  onConnect,
  onDisconnect,
  onRefresh,
  embedded = false,
}: {
  status: WebsiteStatus;
  busy: boolean;
  refreshBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  embedded?: boolean;
}) {
  const syncedLabel = formatSyncedAt(status.lastSyncedAt);
  const meta = WEBSITE_INTEGRATION_META;

  return (
    <div
      className={cn(
        embedded
          ? cn(
              "w-full rounded-lg border p-4 sm:p-5",
              status.connected
                ? "border-[#335cff]/30 bg-[#F8FAFF]"
                : "border-[#E1E4EA] bg-[#FAFAFA]"
            )
          : cn(userPanelClass, "w-full")
      )}
    >
      <div className={embedded ? undefined : "p-5 sm:p-6"}>
        <div className="flex w-full items-center gap-4 sm:gap-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E1E4EA]/80 bg-white text-[#335cff]">
            <Globe className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={userTitleClass}>{meta.name}</h3>
            <p className={`${userLabelClass} mt-1`}>{meta.description}</p>
            {status.connected ? (
              <div className={`${userLabelClass} mt-2 space-y-1`}>
                <p>
                  Verbunden mit{" "}
                  <span className="text-[#0E121B]">
                    {status.accountLabel ?? status.url}
                  </span>
                </p>
                {status.pagesScraped ? (
                  <p>{status.pagesScraped} Seite(n) in Wissensdatenbank</p>
                ) : null}
                {syncedLabel ? <p>Zuletzt aktualisiert: {syncedLabel}</p> : null}
                {status.syncStatus === "pending" ? (
                  <p className="text-[#525866]">Wird analysiert …</p>
                ) : null}
                {status.syncStatus === "error" && status.syncError ? (
                  <p className="text-red-600">{status.syncError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {status.connected ? (
              <>
                <button
                  type="button"
                  className={cn(landingBtnSecondary, landingIntegrationCardBtn)}
                  onClick={onRefresh}
                  disabled={busy || refreshBusy || status.syncStatus === "pending"}
                >
                  {(refreshBusy || status.syncStatus === "pending") && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {!refreshBusy && status.syncStatus !== "pending" && (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Aktualisieren
                </button>
                <button
                  type="button"
                  className={cn(landingBtnSecondary, landingIntegrationCardBtn)}
                  onClick={onDisconnect}
                  disabled={busy || refreshBusy}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Trennen
                </button>
              </>
            ) : (
              <button
                type="button"
                className={cn(landingBtnPrimary, landingIntegrationCardBtn)}
                onClick={onConnect}
                disabled={busy}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Verbinden
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectDialog({
  open,
  initialUrl,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  initialUrl: string;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void | Promise<void>;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setUrl(initialUrl);
  }, [open, initialUrl]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/website/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Website verbunden — Wissensdatenbank wird angereichert");
        await onConnected();
      } else {
        toast.error(data.error ?? "Verbindung fehlgeschlagen");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Betreiber-Website verbinden</DialogTitle>
          <DialogDescription>
            Geben Sie die URL Ihrer Verwaltungs-Website ein. Linker liest die
            Seiten aus, erkennt Leistungen, Formulare (z. B. Schadensmeldung)
            und pflegt alles in die Wissensdatenbank Ihrer Assistenten ein.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="website-url">Website-URL</Label>
            <Input
              id="website-url"
              type="url"
              inputMode="url"
              placeholder="https://www.ihre-verwaltung.ch"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={landingBtnSecondary}
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" className={landingBtnPrimary} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Wird analysiert …" : "Verbinden & analysieren"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
