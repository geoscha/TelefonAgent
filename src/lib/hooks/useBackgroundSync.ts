"use client";

import { useEffect } from "react";

import { prefetchCustomersFeed } from "@/lib/client/tab-prefetch";
import { sessionThrottle } from "@/lib/client/stale-cache";

/** Runs billing + call sync in the background (throttled per session). */
export function useBackgroundSync(options?: {
  syncCalls?: boolean;
  onCallsSynced?: () => void;
  onBillingSynced?: () => void;
}) {
  const { syncCalls = true, onCallsSynced, onBillingSynced } = options ?? {};

  useEffect(() => {
    const tasks: Promise<void>[] = [];

    if (sessionThrottle("billing-sync", 5 * 60_000)) {
      tasks.push(
        fetch("/api/billing/sync", { method: "POST" })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok) onBillingSynced?.();
          })
          .catch(() => {})
      );
    }

    if (syncCalls && sessionThrottle("calls-sync", 90_000)) {
      tasks.push(
        fetch("/api/calls/sync", { method: "POST" })
          .then(() => fetch("/api/calls/screen", { method: "POST" }))
          .then(() => onCallsSynced?.())
          .catch(() => {})
      );
    }

    void Promise.all(tasks);
  }, [syncCalls, onCallsSynced, onBillingSynced]);

  // Keep the customer-database mirror fresh: refresh when Linker is opened and
  // then hourly while it stays open. The server only re-pulls from the source
  // when the mirror is older than its TTL (1h), so this stays cheap.
  useEffect(() => {
    const refreshCustomers = () => {
      fetch("/api/customers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staleOnly: true }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && !data.skipped) {
            void prefetchCustomersFeed();
          }
        })
        .catch(() => {});
    };

    refreshCustomers();
    const timer = window.setInterval(refreshCustomers, 60 * 60_000);
    return () => window.clearInterval(timer);
  }, []);
}

/** Triggers ElevenLabs call sync and optional callback (no throttle). */
export async function syncCallsInBackground(onDone?: () => void): Promise<void> {
  try {
    await fetch("/api/calls/sync", { method: "POST" });
    await fetch("/api/calls/screen", { method: "POST" });
    onDone?.();
  } catch {
    /* non-fatal */
  }
}

/** Screens unanalyzed calls for calendar bookings. */
export async function screenCallsInBackground(onDone?: () => void): Promise<void> {
  try {
    await fetch("/api/calls/screen", { method: "POST" });
    onDone?.();
  } catch {
    /* non-fatal */
  }
}
