"use client";

import { useEffect } from "react";

import { notifyTokenBalanceChanged } from "@/lib/hooks/useTokenBalance";

/** Refreshes the header token badge after viewing a billed call. */
export function CallDetailBillingSync({ refresh }: { refresh: boolean }) {
  useEffect(() => {
    if (refresh) notifyTokenBalanceChanged();
  }, [refresh]);

  return null;
}
