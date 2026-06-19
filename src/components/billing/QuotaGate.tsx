"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { readPendingStripeCheckout } from "@/lib/billing/pending-checkout-client";
import { useTokenBalance } from "@/lib/hooks/useTokenBalance";
import { cn } from "@/lib/utils";

export function QuotaGate({ children }: { children: React.ReactNode }) {
  const setupDemo = useSetupDemoOptional();
  const { tokenBalance, loading } = useTokenBalance({ syncOnMount: true });
  const [pendingCheckout, setPendingCheckout] = useState(false);

  const demoBuyingTokens =
    setupDemo?.active &&
    setupDemo.step === "phone" &&
    (setupDemo.subStepId === "phone_tokens" ||
      setupDemo.subStepId === "phone_billing" ||
      setupDemo.overlayPaused);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncPending() {
      setPendingCheckout(Boolean(readPendingStripeCheckout()));
    }

    syncPending();
    window.addEventListener("pageshow", syncPending);
    document.addEventListener("visibilitychange", syncPending);
    window.addEventListener("cura:token-balance-changed", syncPending);
    return () => {
      window.removeEventListener("pageshow", syncPending);
      document.removeEventListener("visibilitychange", syncPending);
      window.removeEventListener("cura:token-balance-changed", syncPending);
    };
  }, []);

  const exhausted = Boolean(tokenBalance?.exhausted);
  const showPaywall =
    exhausted &&
    !loading &&
    !demoBuyingTokens &&
    !pendingCheckout;

  return (
    <div className="relative min-h-[200px]">
      <div
        className={
          showPaywall ? "pointer-events-none select-none opacity-40" : undefined
        }
      >
        {children}
      </div>
      {showPaywall && tokenBalance && (
        <div className="absolute inset-0 z-20 flex items-start justify-center pt-32 sm:pt-44">
          <div className={cn(userPanelClass, "mx-4 max-w-sm p-5 shadow-sm")}>
            <p className={userTitleClass}>Guthaben aufladen</p>
            <p className={`${userLabelClass} mt-2`}>
              {tokenBalance.phonePaused
                ? "Ihre Nummer ist vorübergehend pausiert. Mit frischem Guthaben sind Sie sofort wieder erreichbar."
                : "Laden Sie Tokens auf, um Ihre Telefonnummer zu aktivieren und Anrufe zu empfangen."}
            </p>
            <Link
              href="/billing"
              className={cn(landingBtnPrimary, "mt-4 w-full justify-center")}
            >
              Jetzt aufladen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
