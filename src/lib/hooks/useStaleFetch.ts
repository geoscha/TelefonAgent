"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  readCached,
  isCacheFresh,
  writeStaleCache,
  invalidateStaleCache,
  STALE_CACHE_UPDATED_EVENT,
} from "@/lib/client/stale-cache";

interface UseStaleFetchOptions {
  ttlMs?: number;
  /** Revalidate in background after showing cached data. Default true. */
  revalidate?: boolean;
  /** Always background-refresh on mount even when cache is fresh. Default false. */
  alwaysRevalidate?: boolean;
}

export function useStaleFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseStaleFetchOptions = {}
): {
  data: T | null;
  loading: boolean;
  revalidating: boolean;
  revalidate: () => Promise<void>;
  invalidate: () => void;
} {
  const {
    ttlMs = 90_000,
    revalidate: shouldRevalidate = true,
    alwaysRevalidate = false,
  } = options;
  const [data, setData] = useState<T | null>(() => readCached<T>(key));
  const [loading, setLoading] = useState(() => readCached<T>(key) === null);
  const [revalidating, setRevalidating] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runFetch = useCallback(
    async (background: boolean) => {
      if (!background) setLoading(true);
      else setRevalidating(true);
      try {
        const next = await fetcherRef.current();
        writeStaleCache(key, next);
        setData(next);
      } catch {
        /* keep stale data on screen */
      } finally {
        if (!background) setLoading(false);
        setRevalidating(false);
      }
    },
    [key]
  );

  const revalidate = useCallback(async () => {
    await runFetch(true);
  }, [runFetch]);

  const invalidate = useCallback(() => {
    invalidateStaleCache(key);
    setData(null);
    setLoading(true);
  }, [key]);

  useEffect(() => {
    function onCacheUpdated(event: Event) {
      const detail = (event as CustomEvent<{ key: string }>).detail;
      if (detail?.key !== key) return;
      const cached = readCached<T>(key);
      if (cached !== null) {
        setData(cached);
        setLoading(false);
      }
    }

    window.addEventListener(STALE_CACHE_UPDATED_EVENT, onCacheUpdated);
    return () =>
      window.removeEventListener(STALE_CACHE_UPDATED_EVENT, onCacheUpdated);
  }, [key]);

  useEffect(() => {
    const cached = readCached<T>(key);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
      if (shouldRevalidate) {
        const stale = !isCacheFresh(key, ttlMs);
        if (stale || alwaysRevalidate) void runFetch(true);
      }
      return;
    }
    void runFetch(false);
  }, [key, ttlMs, shouldRevalidate, alwaysRevalidate, runFetch]);

  return { data, loading, revalidating, revalidate, invalidate };
}
