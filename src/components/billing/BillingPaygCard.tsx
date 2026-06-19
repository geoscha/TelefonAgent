"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { landingBtnPrimary, landingBtnSecondary } from "@/components/landing/landing-buttons";
import {
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

interface PaygStatus {
  enabled: boolean;
  configured: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
}

interface BillingPaygCardProps {
  onEnabledChange?: (enabled: boolean) => void;
}

export function BillingPaygCard({ onEnabledChange }: BillingPaygCardProps) {
  const [status, setStatus] = useState<PaygStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/payg");
      const data = await res.json();
      if (res.ok && data.ok) {
        const enabled = Boolean(data.enabled);
        setStatus({
          enabled,
          configured: Boolean(data.configured),
          cardBrand: data.cardBrand ?? null,
          cardLast4: data.cardLast4 ?? null,
        });
        onEnabledChange?.(enabled);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [onEnabledChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startSetup() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/payg", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Karte konnte nicht hinterlegt werden.");
    } catch {
      toast.error("Karte konnte nicht hinterlegt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCard() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/payg", { method: "DELETE" });
      if (res.ok) {
        toast.success("Pay as you go deaktiviert.");
        await load();
        return;
      }
      toast.error("Deaktivieren fehlgeschlagen.");
    } catch {
      toast.error("Deaktivieren fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={cn(userPanelClass, "flex min-h-[180px] items-center justify-center p-6")}>
        <Loader2 className="h-5 w-5 animate-spin text-[#525866]" />
      </div>
    );
  }

  const active = Boolean(status?.enabled);

  return (
    <div className={cn(userPanelClass, "flex flex-col p-6")}>
      <p className={userTitleClass}>Unlimited</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-[28px] font-normal leading-none text-[#0E121B]">
          Pay as you Go
        </span>
      </div>
      <div className="mt-auto pt-6">
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void removeCard()}
            className={cn(landingBtnSecondary, "w-full justify-center")}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Karte entfernen"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || status?.configured === false}
            onClick={() => void startSetup()}
            className={cn(landingBtnPrimary, "w-full justify-center")}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Karte hinterlegen"}
          </button>
        )}
      </div>
    </div>
  );
}
