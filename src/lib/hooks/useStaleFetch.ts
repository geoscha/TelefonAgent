"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  readStaleCache,
  writeStaleCache,
  invalidateStaleCache,
} from "@/lib/client/stale-cache";

interface UseStaleFetchOptions {
  ttlMs?: number;
  /** Revalidate in background after showing cached data. Default true. */
  revalidate?: boolean;
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
  const { ttlMs = 90_000, revalidate: shouldRevalidate = true } = options;
  const [data, setData] = useState<T | null>(() => readStaleCache<T>(key, ttlMs));
  const [loading, setLoading] = useState(() => data === null);
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
        /* keep stale data */
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
  }, [key]);

  useEffect(() => {
    const cached = readStaleCache<T>(key, ttlMs);
    if (cached) {
      setData(cached);
      setLoading(false);
      if (shouldRevalidate) void runFetch(true);
      return;
    }
    void runFetch(false);
  }, [key, ttlMs, shouldRevalidate, runFetch]);

  return { data, loading, revalidating, revalidate, invalidate };
}
