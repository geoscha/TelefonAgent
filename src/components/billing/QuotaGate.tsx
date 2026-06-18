"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import type { CallQuotaView } from "@/lib/billing/quota-display";
import { formatQuotaDuration } from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

export function QuotaGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [quota, setQuota] = useState<CallQuotaView | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => {
        if (p.callQuota) setQuota(p.callQuota as CallQuotaView);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "monthly" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        toast.success("Willkommen bei Cura Pro – Ihr Plan ist aktiv.");
        if (data.callQuota) setQuota(data.callQuota as CallQuotaView);
        router.refresh();
        return;
      }
      toast.error(data.error ?? "Upgrade fehlgeschlagen.");
    } catch {
      toast.error("Upgrade fehlgeschlagen.");
    } finally {
      setUpgrading(false);
    }
  }

  const exhausted = Boolean(quota?.exhausted);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[#525866]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[200px]">
      <div
        className={
          exhausted ? "pointer-events-none select-none opacity-40" : undefined
        }
      >
        {children}
      </div>
      {exhausted && quota && (
        <div className="absolute inset-0 z-20 flex items-start justify-center pt-16 sm:pt-24">
          <div className={cn(userPanelClass, "mx-4 max-w-sm p-5 shadow-sm")}>
            <p className={userTitleClass}>Kontingent aufgebraucht</p>
            <p className={`${userLabelClass} mt-2`}>
              {quota.plan === "free"
                ? `Ihre ${formatQuotaDuration(quota.limitSeconds)} Gratis-Zeit sind verbraucht.`
                : "Ihre Monatsstunde ist verbraucht."}
            </p>
            {quota.plan === "free" ? (
              <button
                type="button"
                className={cn(landingBtnPrimary, "mt-4 w-full justify-center")}
                onClick={handleUpgrade}
                disabled={upgrading}
              >
                {upgrading && <Loader2 className="h-4 w-4 animate-spin" />}
                Auf Pro upgraden
              </button>
            ) : (
              <Link
                href="/billing"
                className={cn(landingBtnPrimary, "mt-4 w-full justify-center")}
              >
                Plan verwalten
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
