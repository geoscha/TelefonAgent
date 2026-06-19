"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const BETA_UNAVAILABLE_MESSAGE =
  "Kalender-Integrationen sind in der Beta-Version noch nicht verfügbar.";

interface CalStatus {
  provider: "apple";
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
}

const APPLE_META = {
  name: "Apple Kalender (iCloud)",
  description: "iCloud-Kalender mit einem App-Passwort verbinden.",
};

export function CalendarIntegrations() {
  const [status, setStatus] = useState<CalStatus | null>(null);
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

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get("connected");
    const error = p.get("error");
    if (connected || error) {
      toast.message(BETA_UNAVAILABLE_MESSAGE);
      window.history.replaceState({}, "", "/integrations");
    }
  }, []);

  function handleConnect() {
    toast.message(BETA_UNAVAILABLE_MESSAGE);
  }

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
    <div className="max-w-md">
      <ProviderCard
        status={status}
        busy={busy}
        onConnect={handleConnect}
        onDisconnect={() => void disconnect()}
      />
    </div>
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
          <StatusBadge connected={status.connected} />
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

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-2 py-0.5 text-[12px] font-normal",
        connected
          ? "border-[#335cff]/20 bg-[#EBEEF4] text-[#335cff]"
          : "border-[#E1E4EA] bg-[#F5F7FA] text-[#525866]"
      )}
    >
      {connected ? "Verbunden" : "Nicht verbunden"}
    </span>
  );
}
