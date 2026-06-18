"use client";

import { useCallback, useEffect, useState } from "react";

import {
  invalidateStaleCache,
  readStaleCache,
  writeStaleCache,
} from "@/lib/client/stale-cache";
import type { TokenBalanceView } from "@/lib/billing/quota-display";

const TOKEN_BALANCE_CACHE_KEY = "token-balance";

async function fetchTokenBalance(): Promise<TokenBalanceView> {
  const res = await fetch("/api/profile");
  const data = (await res.json()) as { tokenBalance?: TokenBalanceView };
  if (!res.ok || !data.tokenBalance) {
    throw new Error("token balance load failed");
  }
  writeStaleCache(TOKEN_BALANCE_CACHE_KEY, data.tokenBalance);
  return data.tokenBalance;
}

export function notifyTokenBalanceChanged(): void {
  if (typeof window === "undefined") return;
  invalidateStaleCache(TOKEN_BALANCE_CACHE_KEY);
  window.dispatchEvent(new Event("cura:token-balance-changed"));
}

export function useTokenBalance(options?: { syncOnMount?: boolean }) {
  const syncOnMount = options?.syncOnMount ?? false;
  const [tokenBalance, setTokenBalance] = useState<TokenBalanceView | null>(() =>
    readStaleCache<TokenBalanceView>(TOKEN_BALANCE_CACHE_KEY, 120_000)
  );
  const [loading, setLoading] = useState(!tokenBalance);

  const refresh = useCallback(async (sync = false) => {
    try {
      const url = sync ? "/api/profile?sync=1" : "/api/profile";
      const res = await fetch(url);
      const data = (await res.json()) as { tokenBalance?: TokenBalanceView };
      if (res.ok && data.tokenBalance) {
        writeStaleCache(TOKEN_BALANCE_CACHE_KEY, data.tokenBalance);
        setTokenBalance(data.tokenBalance);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(syncOnMount);
  }, [refresh, syncOnMount]);

  useEffect(() => {
    function onChanged() {
      void refresh(false);
    }
    window.addEventListener("cura:token-balance-changed", onChanged);
    return () => window.removeEventListener("cura:token-balance-changed", onChanged);
  }, [refresh]);

  const invalidate = useCallback(() => {
    notifyTokenBalanceChanged();
  }, []);

  return { tokenBalance, loading, refresh, invalidate };
}

export function prefetchTokenBalance(): Promise<TokenBalanceView> {
  const cached = readStaleCache<TokenBalanceView>(TOKEN_BALANCE_CACHE_KEY, 120_000);
  if (cached) return Promise.resolve(cached);
  return fetchTokenBalance();
}
