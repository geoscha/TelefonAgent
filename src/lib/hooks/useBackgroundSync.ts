"use client";

import { useEffect } from "react";

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
