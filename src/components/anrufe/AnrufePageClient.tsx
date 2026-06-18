"use client";

import { useCallback, useEffect } from "react";

import { CallRow } from "@/components/dashboard/CallRow";
import { AnrufeExtras } from "@/components/anrufe/AnrufeExtras";
import { EmptyState } from "@/components/brand/EmptyState";
import { userPanelClass } from "@/components/user/user-styles";
import { Skeleton } from "@/components/ui/skeleton";
import {
  syncCallsInBackground,
  useBackgroundSync,
} from "@/lib/hooks/useBackgroundSync";
import { useStaleFetch } from "@/lib/hooks/useStaleFetch";
import type { Call } from "@/lib/types";

async function fetchCalls(): Promise<Call[]> {
  const res = await fetch("/api/calls");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("load failed");
  return data.calls as Call[];
}

export function AnrufePageClient() {
  const { data: calls, loading, revalidate, revalidating } = useStaleFetch(
    "calls-feed",
    fetchCalls,
    { ttlMs: 60_000 }
  );

  const refreshCalls = useCallback(() => {
    void revalidate();
  }, [revalidate]);

  useBackgroundSync({
    syncCalls: true,
    onCallsSynced: refreshCalls,
  });

  useEffect(() => {
    if (loading || revalidating) return;
    const id = window.setInterval(() => {
      void syncCallsInBackground(refreshCalls);
    }, 90_000);
    return () => window.clearInterval(id);
  }, [loading, revalidating, refreshCalls]);

  const list = calls ?? [];

  return (
    <div className="space-y-section">
      <AnrufeExtras onStatsRefresh={refreshCalls} />
      <section>
        <div className={`${userPanelClass} overflow-hidden`}>
          {loading && list.length === 0 ? (
            <div className="space-y-0 divide-y divide-[#E1E4EA]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : list.length > 0 ? (
            <div className="divide-y divide-[#E1E4EA]">
              {list.map((call) => (
                <CallRow key={call.id} call={call} />
              ))}
            </div>
          ) : (
            <EmptyState illustration="calls" title="Noch keine Anrufe" subtle />
          )}
        </div>
      </section>
    </div>
  );
}
