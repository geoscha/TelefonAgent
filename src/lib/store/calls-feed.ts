import "server-only";

import type { Call } from "@/lib/types";
import { syncCallsForCurrentUser } from "@/lib/elevenlabs/sync-calls";
import { getStoredCalls } from "@/lib/store";

/**
 * Syncs from ElevenLabs then returns stored calls for the signed-in user.
 */
export async function ensureUserCallsSynced(): Promise<void> {
  try {
    await syncCallsForCurrentUser();
  } catch (err) {
    console.warn("[calls-feed] sync skipped:", err);
  }
}

export async function getFeedCalls(limit = 10): Promise<Call[]> {
  await ensureUserCallsSynced();
  const stored = await getStoredCalls();
  const sorted = [...stored].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return sorted.slice(0, limit);
}

export async function getAllFeedCalls(): Promise<Call[]> {
  await ensureUserCallsSynced();
  const stored = await getStoredCalls();
  return [...stored].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

export async function getFeedCall(id: string): Promise<Call | null> {
  await ensureUserCallsSynced();
  const stored = await getStoredCalls();
  return stored.find((c) => c.id === id) ?? null;
}

export interface CallCounts {
  total: number;
  today: number;
}

export async function getCallCounts(): Promise<CallCounts> {
  await ensureUserCallsSynced();
  const stored = await getStoredCalls();
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const today = stored.filter(
    (c) => new Date(c.startedAt).getTime() >= startOfToday
  ).length;
  return { total: stored.length, today };
}
