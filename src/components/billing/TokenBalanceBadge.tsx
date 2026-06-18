"use client";

import Link from "next/link";

import { formatTokenCount } from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

interface TokenBalanceBadgeProps {
  balance: number;
  phonePaused?: boolean;
  loading?: boolean;
  className?: string;
}

export function TokenBalanceBadge({
  balance,
  phonePaused = false,
  loading = false,
  className,
}: TokenBalanceBadgeProps) {
  return (
    <Link
      href="/billing"
      className={cn(
        "text-[13px] font-normal tabular-nums text-[#525866] transition-colors hover:text-[#0E121B]",
        phonePaused && "text-[#525866]",
        className
      )}
      title="Token-Guthaben verwalten"
    >
      {loading ? "…" : `${formatTokenCount(Math.max(0, balance))} Tokens`}
    </Link>
  );
}
