"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BillingHistorySection } from "@/components/billing/BillingHistorySection";
import { BillingPaygCard } from "@/components/billing/BillingPaygCard";
import { BillingPricingOverview } from "@/components/billing/BillingPricingOverview";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
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
import { storePendingStripeCheckout } from "@/lib/billing/pending-checkout-client";
import { useStripeCheckoutReturn } from "@/lib/billing/use-stripe-checkout-return";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupDemo = useSetupDemoOptional();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<{
    paymentsEnabled: boolean;
  } | null>(null);
  const [packs, setPacks] = useState<TokenPackConfig[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [paygEnabled, setPaygEnabled] = useState(false);

  const demoBillingStep =
    setupDemo?.active &&
    setupDemo.step === "phone" &&
    setupDemo.subStepId === "phone_billing";

  const finishDemoTokenPurchase = useCallback(() => {
    if (!setupDemo?.active || setupDemo.step !== "phone") return;
    setupDemo.goToSubStep("phone_request");
    router.push("/phones");
  }, [router, setupDemo]);

  useEffect(() => {
    if (!demoBillingStep || packsLoading) return;
    const el = document.querySelector(
      '[data-setup-demo="setup-demo-billing-pack-5k"]'
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [demoBillingStep, packsLoading]);

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
            paymentsEnabled: Boolean(data.paymentsEnabled),
          });
        }
      })
      .catch(() => {});
  }, []);

  useStripeCheckoutReturn({
    pathname: "/billing",
    onSuccess: () => {
      if (demoBillingStep) {
        finishDemoTokenPurchase();
        return;
      }
      fetch("/api/profile")
        .then((r) => r.json())
        .then((data) => {
          if (data?.tokenBalance) {
            setProfile((prev) =>
              prev ? { ...prev, tokenBalance: data.tokenBalance } : prev
            );
          }
        })
        .catch(() => {});
    },
  });

  useEffect(() => {
    const payg = searchParams.get("payg");
    if (payg === "cancel") {
      toast.message("Karten-Setup abgebrochen.");
      window.history.replaceState({}, "", "/billing");
      return;
    }
    if (payg === "success") {
      setPaygEnabled(true);
      toast.success("Pay as you go aktiviert — Ihre Karte ist hinterlegt.");
      window.history.replaceState({}, "", "/billing");
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => setProfile(p))
      .catch(() => toast.error("Profil konnte nicht geladen werden."));
  }, []);

  useEffect(() => {
    fetch("/api/billing/payg")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPaygEnabled(Boolean(data.enabled));
      })
      .catch(() => {});
  }, []);

  async function buyPack(packId: string) {
    setLoadingPack(packId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId,
          ...(demoBillingStep ? { returnTo: "phones" } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        sessionId?: string;
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
        if (demoBillingStep) {
          finishDemoTokenPurchase();
        }
        return;
      }
      if (res.ok && data.url) {
        if (data.sessionId) {
          storePendingStripeCheckout({
            sessionId: data.sessionId,
            returnTo: demoBillingStep ? "phones" : "billing",
          });
        }
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
  const bannerHighlight = paygEnabled
    ? { value: "Pay as you go", suffix: "aktiv" }
    : balanceHighlight;

  return (
    <div className="mx-auto max-w-[900px] space-y-8 pb-4">
        <WelcomeBanner
          name={firstName}
          highlight={bannerHighlight.value}
          highlightSuffix={bannerHighlight.suffix}
        />

        {profile?.tokenBalance?.phonePaused && (
          <div className={cn(userPanelClass, "border-amber-200 bg-amber-50/50 p-5")}>
            <p className={userTitleClass}>Nummer vorübergehend pausiert</p>
            <p className={`${userLabelClass} mt-2`}>
              Tokens aufladen, um Ihre Nummer wieder zu aktivieren. Agenten bleiben
              erhalten. Ohne Aufladung innerhalb von 7 Tagen wird die Nummer
              freigegeben.
            </p>
          </div>
        )}

        <div>
          <p className={userTitleClass}>Guthaben aufladen</p>
          <p className={`${userLabelClass} mt-1`}>
            Wählen Sie ein Paket, um Tokens für Telefonate und Nummern zu kaufen.
            {billingStatus?.paymentsEnabled
              ? " Bezahlung per Karte, Apple Pay oder Google Pay."
              : null}
          </p>
          {billingStatus && !billingStatus.paymentsEnabled && (
            <p className="mt-2 text-[13px] text-amber-700">
              Aufladung ist derzeit nicht verfügbar. Bitte versuchen Sie es später
              erneut.
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
            <>
              {packs
                .filter((pack) => pack.id !== "pack_100k")
                .map((pack) => {
                  const isDemoRecommended =
                    demoBillingStep && pack.id === "pack_5k";
                  return (
              <div
                key={pack.id}
                data-setup-demo={
                  isDemoRecommended ? "setup-demo-billing-pack-5k" : undefined
                }
                className={cn(
                  userPanelClass,
                  "flex flex-col p-6",
                  isDemoRecommended && "border-2 border-[#0E121B]"
                )}
              >
                {isDemoRecommended && (
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#525866]">
                    Empfohlen
                  </p>
                )}
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
                      (billingStatus !== null && !billingStatus.paymentsEnabled)
                    }
                    className={cn(landingBtnPrimary, "w-full justify-center")}
                  >
                    {loadingPack === pack.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Jetzt kaufen
                  </button>
                </div>
              </div>
            );
                })}
              <BillingPaygCard onEnabledChange={setPaygEnabled} />
            </>
          )}
        </div>

        <BillingPricingOverview />

        <BillingHistorySection />
    </div>
  );
}
