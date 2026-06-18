"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { QuotaGate } from "@/components/billing/QuotaGate";
import {
  landingBtnPrimary,
} from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import {
  FREE_CALL_SECONDS_LIMIT,
  quotaRemainingHighlight,
  type CallQuotaView,
} from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

type BillingPlan = "free" | "pro";
type BillingInterval = "monthly" | "yearly";

interface Profile {
  name: string;
  plan: BillingPlan;
  billingInterval?: BillingInterval;
  callQuota?: CallQuotaView;
}

const freeFeatures = [
  `${FREE_CALL_SECONDS_LIMIT} Sekunden Telefonate (Gesamt)`,
  "KI-Telefonagent",
  "Anruf-Transkripte & Zusammenfassungen",
];

const proFeatures = [
  "1 Stunde Telefonate pro Monat",
  "Kalender-Integration & Terminbuchung",
  "Erweiterte Auswertungen",
  "Priorisierter Support",
];

export default function BillingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        if (p.billingInterval) setInterval(p.billingInterval);
      })
      .catch(() => toast.error("Profil konnte nicht geladen werden."));
  }, []);

  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = (await res.json().catch(() => ({}))) as Profile & {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok !== false) {
        setProfile(data);
        toast.success("Willkommen bei Cura Pro – Ihr Plan ist aktiv.");
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

  const isPro = profile?.plan === "pro";
  const proPrice = interval === "yearly" ? "CHF 1’000" : "CHF 50";
  const proPer = interval === "yearly" ? "/ Jahr" : "/ Monat";
  const firstName = profile?.name.trim().split(/\s+/)[0] || "…";
  const quotaHighlight = profile?.callQuota
    ? quotaRemainingHighlight(profile.callQuota)
    : { value: "—", suffix: "Min. frei" };

  return (
    <QuotaGate>
      <div className="mx-auto max-w-[900px] space-y-8 pb-4">
        <WelcomeBanner
          name={firstName}
          highlight={quotaHighlight.value}
          highlightSuffix={quotaHighlight.suffix}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="inline-flex items-center rounded border border-[#E1E4EA] bg-white p-0.5 text-[13px] font-normal">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={cn(
                "rounded px-4 py-1.5 transition-colors",
                interval === "monthly"
                  ? "bg-[#0E121B] text-white"
                  : "text-[#525866] hover:text-[#0E121B]"
              )}
            >
              Monatlich
            </button>
            <button
              type="button"
              onClick={() => setInterval("yearly")}
              className={cn(
                "rounded px-4 py-1.5 transition-colors",
                interval === "yearly"
                  ? "bg-[#0E121B] text-white"
                  : "text-[#525866] hover:text-[#0E121B]"
              )}
            >
              Jährlich
              <span
                className={cn(
                  "ml-1.5 rounded px-1.5 py-0.5 text-[11px]",
                  interval === "yearly"
                    ? "bg-white/20 text-white"
                    : "bg-[#EDEAE4] text-[#525866]"
                )}
              >
                −17%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div
            className={cn(
              userPanelClass,
              "relative flex flex-col p-7",
              !isPro && "border-[#335cff]/30"
            )}
          >
            {!isPro && (
              <span className="absolute right-6 top-6 rounded bg-[#D4EDDA] px-2.5 py-1 text-[12px] font-normal text-[#1A3D2E]">
                Aktueller Plan
              </span>
            )}
            <p className={userTitleClass}>Gratis</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-[32px] font-normal leading-none text-[#0E121B]">
                CHF 0
              </span>
              <span className={userLabelClass}>/ Monat</span>
            </div>
            <ul className="mt-6 space-y-2">
              {freeFeatures.map((f) => (
                <li key={f} className={userLabelClass}>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-7">
              <button type="button" className={cn(landingBtnPrimary, "w-full justify-center opacity-50")} disabled>
                {isPro ? "Auf Gratis wechseln" : "Aktueller Plan"}
              </button>
            </div>
          </div>

          <div
            className={cn(
              userPanelClass,
              "relative flex flex-col p-7",
              isPro && "border-[#335cff]/30"
            )}
          >
            {isPro && (
              <span className="absolute right-6 top-6 rounded bg-[#EBEEF4] px-2.5 py-1 text-[12px] font-normal text-[#335cff]">
                Aktueller Plan
              </span>
            )}
            <p className={userTitleClass}>Cura Pro</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-[32px] font-normal leading-none text-[#0E121B]">{proPrice}</span>
              <span className={userLabelClass}>{proPer}</span>
            </div>
            <ul className="mt-6 space-y-2">
              {proFeatures.map((f) => (
                <li key={f} className={userLabelClass}>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-7">
              <button
                type="button"
                onClick={upgrade}
                disabled={upgrading || isPro}
                className={cn(landingBtnPrimary, "w-full justify-center")}
              >
                {upgrading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isPro ? "Aktiv" : "Jetzt upgraden"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </QuotaGate>
  );
}
