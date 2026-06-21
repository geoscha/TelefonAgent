"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
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
import { IntegrationLogoTile } from "@/components/integrations/IntegrationLogoTile";
import { INTEGRATION_LOGOS } from "@/lib/integrations/integration-logos";
import { matchesIntegrationSearch } from "@/lib/integrations/search";
import {
  compareConnectedThenName,
  type IntegrationCardEntry,
} from "@/lib/integrations/sort";
import {
  SMS_PROVIDERS,
  SMS_PROVIDER_META,
  smsDefaultFieldValues,
  type SmsProviderId,
} from "@/lib/integrations/sms/provider-meta";
import { cn } from "@/lib/utils";

interface SmsStatus {
  provider: SmsProviderId;
  connected: boolean;
  accountLabel?: string;
  senderId?: string;
  connectedAt?: string;
}

const SMS_LOGOS: Record<
  SmsProviderId,
  { src: string; width: number; height: number }
> = {
  twilio: INTEGRATION_LOGOS.twilioSms,
  seven: INTEGRATION_LOGOS.sevenSms,
  aspsms: INTEGRATION_LOGOS.aspsms,
};

export function SmsIntegrations({
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
  const [statuses, setStatuses] = useState<SmsStatus[] | null>(null);
  const [dialogProvider, setDialogProvider] = useState<SmsProviderId | null>(
    null
  );
  const [busyProvider, setBusyProvider] = useState<SmsProviderId | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.sms)) {
        setStatuses(data.sms as SmsStatus[]);
      } else {
        setStatuses(
          SMS_PROVIDERS.map((provider) => ({ provider, connected: false }))
        );
      }
    } catch {
      setStatuses(
        SMS_PROVIDERS.map((provider) => ({ provider, connected: false }))
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function disconnect(provider: SmsProviderId) {
    setBusyProvider(provider);
    try {
      const res = await fetch(
        `/api/integrations/sms/${provider}/disconnect`,
        { method: "POST" }
      );
      if (res.ok) {
        toast.success(`${SMS_PROVIDER_META[provider].name} getrennt`);
        await load();
      } else {
        toast.error("Trennen fehlgeschlagen");
      }
    } finally {
      setBusyProvider(null);
    }
  }

  function requestConnect(provider: SmsProviderId) {
    setDialogProvider(provider);
  }

  const visible = useMemo(() => {
    const filtered = SMS_PROVIDERS.filter((provider) => {
      const meta = SMS_PROVIDER_META[provider];
      return matchesIntegrationSearch(searchQuery, {
        category: "sms",
        id: provider,
        name: meta.name,
        description: meta.description,
      });
    });

    return filtered.sort((a, b) => {
      const statusA =
        statuses?.find((entry) => entry.provider === a) ?? {
          provider: a,
          connected: false,
        };
      const statusB =
        statuses?.find((entry) => entry.provider === b) ?? {
          provider: b,
          connected: false,
        };

      return compareConnectedThenName(
        {
          connected: statusA.connected,
          name: SMS_PROVIDER_META[a].name,
        },
        {
          connected: statusB.connected,
          name: SMS_PROVIDER_META[b].name,
        }
      );
    });
  }, [searchQuery, statuses]);

  const cardEntries = useMemo(() => {
    if (!statuses) return [];

    return visible.map((provider) => {
      const status =
        statuses.find((entry) => entry.provider === provider) ?? {
          provider,
          connected: false,
        };

      return {
        key: `sms:${provider}`,
        name: SMS_PROVIDER_META[provider].name,
        connected: status.connected,
        node: (
          <ProviderCard
            key={provider}
            status={status}
            busy={busyProvider === provider}
            embedded={layout === "page"}
            onConnect={() => requestConnect(provider)}
            onDisconnect={() => void disconnect(provider)}
          />
        ),
      };
    });
  }, [visible, statuses, busyProvider, layout]);

  useEffect(() => {
    registerCards?.(cardEntries);
  }, [cardEntries, registerCards]);

  const cards = cardEntries.map((entry) => entry.node);
  const showCardsInline = !deferCardRender;

  if (!statuses) {
    return <Skeleton className="h-32 w-full rounded" />;
  }

  if (visible.length === 0) return null;

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
        provider={dialogProvider}
        onOpenChange={(open) => !open && setDialogProvider(null)}
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
  embedded = false,
}: {
  status: SmsStatus;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  embedded?: boolean;
}) {
  const meta = SMS_PROVIDER_META[status.provider];
  const logo = SMS_LOGOS[status.provider];

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
          <IntegrationLogoTile
            src={logo.src}
            width={logo.width}
            height={logo.height}
            fit="contain"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={userTitleClass}>{meta.name}</h3>
              <span className="rounded-full border border-[#E1E4EA] bg-white px-2 py-0.5 text-[11px] text-[#525866]">
                {meta.regionLabel}
              </span>
            </div>
            <p className={`${userLabelClass} mt-1`}>{meta.description}</p>
            {status.connected && status.accountLabel ? (
              <p className={`${userLabelClass} mt-2`}>
                Verbunden ·{" "}
                <span className="text-[#0E121B]">{status.accountLabel}</span>
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
                disabled={busy}
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

function ConnectDialog({
  provider,
  onOpenChange,
  onConnected,
}: {
  provider: SmsProviderId | null;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const meta = provider ? SMS_PROVIDER_META[provider] : null;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) {
      setFields(smsDefaultFieldValues(provider));
    }
  }, [provider]);

  async function submit() {
    if (!provider || !meta) return;

    for (const field of meta.fields) {
      if (field.required && !fields[field.id]?.trim()) {
        toast.error(`Bitte «${field.label}» angeben.`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/sms/${provider}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fields.username,
          password: fields.password,
          senderId: fields.senderId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(`${meta.name} verbunden`);
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
    <Dialog open={provider !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meta ? `${meta.name} verbinden` : "Verbinden"}</DialogTitle>
          <DialogDescription>{meta?.connectHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            {meta?.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label htmlFor={`sms-${field.id}`}>{field.label}</Label>
                <Input
                  id={`sms-${field.id}`}
                  type={field.type}
                  autoComplete="off"
                  placeholder={field.placeholder}
                  value={fields[field.id] ?? ""}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </div>
            ))}
          </div>

          {meta?.docsUrl ? (
            <a
              href={meta.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#335cff] underline underline-offset-2 hover:text-[#2547d4]"
            >
              API-Dokumentation
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          ) : null}

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
              onClick={() => void submit()}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Verbinden
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
