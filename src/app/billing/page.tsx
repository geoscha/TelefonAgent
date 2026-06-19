"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BillingHistorySection } from "@/components/billing/BillingHistorySection";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import {
  tokenBalanceHighlight,
  type TokenBalanceView,
} from "@/lib/billing/quota-display";
import { formatChf } from "@/lib/billing/billing-history-format";
import type { TokenPackConfig } from "@/lib/billing/token-pack-types";
import { notifyTokenBalanceChanged } from "@/lib/hooks/useTokenBalance";
import { cn } from "@/lib/utils";

interface Profile {
  name: string;
  tokenBalance?: TokenBalanceView;
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-[#525866]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<{
    stripeConfigured: boolean;
    testMode: boolean;
    paymentsEnabled: boolean;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [packs, setPacks] = useState<TokenPackConfig[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/packs")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.packs)) {
          setPacks(data.packs as TokenPackConfig[]);
        }
      })
      .catch(() => toast.error("Token-Pakete konnten nicht geladen werden."))
      .finally(() => setPacksLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setBillingStatus({
            stripeConfigured: Boolean(data.stripeConfigured),
            testMode: Boolean(data.testMode),
            paymentsEnabled: Boolean(data.paymentsEnabled),
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const topup = searchParams.get("topup");
    const sessionId = searchParams.get("session_id");

    if (topup === "cancel") {
      toast.message("Aufladung abgebrochen.");
      return;
    }

    if (topup !== "success") return;

    if (!sessionId) {
      toast.success("Zahlung erfolgreich. Guthaben wird in Kürze gutgeschrieben.");
      return;
    }

    setVerifying(true);
    fetch("/api/billing/verify-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          tokens?: number;
          tokenBalance?: TokenBalanceView;
          duplicate?: boolean;
          error?: string;
        };
        if (res.ok && data.ok) {
          if (data.tokenBalance) {
            setProfile((prev) =>
              prev ? { ...prev, tokenBalance: data.tokenBalance } : prev
            );
          }
          notifyTokenBalanceChanged();
          if (data.duplicate) {
            toast.success("Guthaben ist bereits gutgeschrieben.");
          } else {
            toast.success(
              data.tokens
                ? `${data.tokens.toLocaleString("de-CH")} Tokens gutgeschrieben.`
                : "Guthaben erfolgreich aufgeladen."
            );
          }
          return;
        }
        toast.error(data.error ?? "Guthaben konnte nicht bestätigt werden.");
      })
      .catch(() => {
        toast.error("Zahlungsbestätigung fehlgeschlagen.");
      })
      .finally(() => {
        setVerifying(false);
        window.history.replaceState({}, "", "/billing");
      });
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => setProfile(p))
      .catch(() => toast.error("Profil konnte nicht geladen werden."));
  }, []);

  async function buyPack(packId: string) {
    setLoadingPack(packId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        ok?: boolean;
        test?: boolean;
        tokens?: number;
        tokenBalance?: TokenBalanceView;
        error?: string;
      };
      if (res.ok && data.test && data.ok) {
        if (data.tokenBalance) {
          setProfile((prev) =>
            prev ? { ...prev, tokenBalance: data.tokenBalance } : prev
          );
        } else {
          const p = (await fetch("/api/profile").then((r) => r.json())) as Profile;
          setProfile(p);
        }
        notifyTokenBalanceChanged();
        toast.success(
          `${(data.tokens ?? 35_000).toLocaleString("de-CH")} Tokens gutgeschrieben (Test).`
        );
        return;
      }
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Checkout konnte nicht gestartet werden.");
    } catch {
      toast.error("Checkout konnte nicht gestartet werden.");
    } finally {
      setLoadingPack(null);
    }
  }

  const firstName = profile?.name.trim().split(/\s+/)[0] || "…";
  const balanceHighlight = profile?.tokenBalance
    ? tokenBalanceHighlight(profile.tokenBalance)
    : { value: "—", suffix: "Tokens" };

  return (
    <div className="mx-auto max-w-[900px] space-y-8 pb-4">
        <WelcomeBanner
          name={firstName}
          highlight={balanceHighlight.value}
          highlightSuffix={balanceHighlight.suffix}
        />

        <div>
          <p className={userTitleClass}>Guthaben aufladen</p>
          <p className={`${userLabelClass} mt-1`}>
            Wählen Sie ein Paket, um Tokens für Telefonate und Nummern zu kaufen.
            {billingStatus?.stripeConfigured && !billingStatus.testMode
              ? " Bezahlung per Karte, Apple Pay oder Google Pay über Stripe."
              : null}
          </p>
          {billingStatus && !billingStatus.paymentsEnabled && (
            <p className="mt-2 text-[13px] text-amber-700">
              Stripe ist noch nicht konfiguriert. Bitte Stripe Secret Key und
              Webhook Secret im Admin unter Einstellungen hinterlegen.
            </p>
          )}
          {billingStatus?.testMode && (
            <p className="mt-2 text-[13px] text-amber-700">
              Testmodus aktiv (BILLING_TEST_MODE) — es wird keine echte Zahlung
              ausgeführt.
            </p>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {packsLoading ? (
            <div className="col-span-full flex items-center justify-center py-12 text-[#525866]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : packs.length === 0 ? (
            <p className={`${userLabelClass} col-span-full`}>
              Keine Token-Pakete verfügbar.
            </p>
          ) : (
            packs.map((pack) => (
              <div key={pack.id} className={cn(userPanelClass, "flex flex-col p-6")}>
                <p className={userTitleClass}>{pack.label}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[28px] font-normal leading-none text-[#0E121B]">
                    CHF {formatChf(pack.priceChf)}
                  </span>
                </div>
                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={() => buyPack(pack.id)}
                    disabled={
                      loadingPack === pack.id ||
                      verifying ||
                      (billingStatus !== null && !billingStatus.paymentsEnabled)
                    }
                    className={cn(landingBtnPrimary, "w-full justify-center")}
                  >
                    {(loadingPack === pack.id || verifying) && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Jetzt kaufen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <BillingHistorySection />

        {profile?.tokenBalance?.phonePaused && (
          <div className={cn(userPanelClass, "border-amber-200 bg-amber-50/50 p-5")}>
            <p className={userTitleClass}>Telefonnummer pausiert</p>
            <p className={`${userLabelClass} mt-2`}>
              Ihr Guthaben ist aufgebraucht. Laden Sie Tokens auf, um Ihre Nummer
              wieder zu aktivieren. Wird innerhalb von 7 Tagen kein Guthaben
              aufgeladen, wird die Nummer freigegeben — Ihre Agenten bleiben
              erhalten.
            </p>
          </div>
        )}
    </div>
  );
}
