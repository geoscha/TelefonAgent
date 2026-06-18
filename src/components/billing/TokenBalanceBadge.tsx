"use client";

import Link from "next/link";

import {
  formatTokenCount,
  TOKEN_LOW_BALANCE_THRESHOLD,
} from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

interface TokenBalanceBadgeProps {
  balance: number;
  loading?: boolean;
  className?: string;
}

export function TokenBalanceBadge({
  balance,
  loading = false,
  className,
}: TokenBalanceBadgeProps) {
  const lowBalance = !loading && balance < TOKEN_LOW_BALANCE_THRESHOLD;

  return (
    <Link
      href="/billing"
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] font-normal tabular-nums transition-colors",
        lowBalance
          ? "text-[#0E121B] hover:opacity-80"
          : "text-[#525866] hover:text-[#0E121B]",
        className
      )}
      title={lowBalance ? "Guthaben aufladen" : "Token-Guthaben verwalten"}
      aria-label={
        loading
          ? "Token-Guthaben wird geladen"
          : lowBalance
            ? "Guthaben aufladen"
            : `${formatTokenCount(Math.max(0, balance))} Tokens`
      }
    >
      {loading ? (
        "…"
      ) : (
        <>
          {lowBalance && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0E121B]"
              aria-hidden
            />
          )}
          <span>{formatTokenCount(Math.max(0, balance))} Tokens</span>
        </>
      )}
    </Link>
  );
}
