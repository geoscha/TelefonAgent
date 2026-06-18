"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import type { TokenBalanceView } from "@/lib/billing/quota-display";
import {
  readStaleCache,
  writeStaleCache,
} from "@/lib/client/stale-cache";
import { cn } from "@/lib/utils";

const TOKEN_CACHE_KEY = "token-balance";

export function QuotaGate({ children }: { children: React.ReactNode }) {
  const [tokenBalance, setTokenBalance] = useState<TokenBalanceView | null>(
    () => readStaleCache<TokenBalanceView>(TOKEN_CACHE_KEY, 120_000)
  );

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => {
        if (p.tokenBalance) {
          const balance = p.tokenBalance as TokenBalanceView;
          setTokenBalance(balance);
          writeStaleCache(TOKEN_CACHE_KEY, balance);
        }
      })
      .catch(() => {});
  }, []);

  const exhausted = Boolean(tokenBalance?.exhausted);

  return (
    <div className="relative min-h-[200px]">
      <div
        className={
          exhausted ? "pointer-events-none select-none opacity-40" : undefined
        }
      >
        {children}
      </div>
      {exhausted && tokenBalance && (
        <div className="absolute inset-0 z-20 flex items-start justify-center pt-16 sm:pt-24">
          <div className={cn(userPanelClass, "mx-4 max-w-sm p-5 shadow-sm")}>
            <p className={userTitleClass}>Guthaben aufgebraucht</p>
            <p className={`${userLabelClass} mt-2`}>
              {tokenBalance.phonePaused
                ? "Ihre Telefonnummer ist pausiert. Laden Sie Tokens auf, um weiterzumachen."
                : "Bitte laden Sie Ihr Token-Guthaben auf, um fortzufahren."}
            </p>
            <Link
              href="/billing"
              className={cn(landingBtnPrimary, "mt-4 w-full justify-center")}
            >
              Guthaben aufladen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
