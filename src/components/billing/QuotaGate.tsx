"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CallQuotaView } from "@/lib/billing/quota-display";
import { formatQuotaDuration } from "@/lib/billing/quota-display";

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
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[200px]">
      <div
        className={
          exhausted
            ? "pointer-events-none select-none blur-[6px] saturate-50"
            : undefined
        }
      >
        {children}
      </div>
      {exhausted && quota && (
        <div className="absolute inset-0 z-20 flex items-start justify-center pt-16 sm:pt-24">
          <div className="mx-4 max-w-sm rounded-card border border-stroke bg-surface p-6 shadow-lg">
            <p className="font-medium text-navy">Kontingent aufgebraucht</p>
            <p className="mt-2 text-body text-text-muted">
              {quota.plan === "free"
                ? `Ihre ${formatQuotaDuration(quota.limitSeconds)} Gratis-Zeit sind verbraucht.`
                : "Ihre Monatsstunde ist verbraucht."}
            </p>
            {quota.plan === "free" ? (
              <Button
                className="mt-4 w-full"
                onClick={handleUpgrade}
                disabled={upgrading}
              >
                {upgrading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Auf Pro upgraden
              </Button>
            ) : (
              <Button asChild className="mt-4 w-full">
                <a href="/einstellungen#pricing">Plan verwalten</a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
