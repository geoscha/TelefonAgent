import "server-only";

import { getCallsForUser, getSettingsForUser, updateSettingsForUser } from "@/lib/store";

export interface CallStatPoint {
  startedAt: string;
  durationSeconds: number;
}

/** Call stats for charts — DB first, archived snapshot as fallback. */
export async function getCallStatsForUser(
  userId: string
): Promise<CallStatPoint[]> {
  const calls = await getCallsForUser(userId);
  if (calls.length > 0) {
    return calls.map((c) => ({
      startedAt: c.startedAt,
      durationSeconds: c.durationSeconds ?? 0,
    }));
  }

  const settings = await getSettingsForUser(userId);
  return settings.archivedCallStats ?? [];
}

export async function snapshotCallStatsForUser(userId: string): Promise<void> {
  const calls = await getCallsForUser(userId);
  const points = calls.map((c) => ({
    startedAt: c.startedAt,
    durationSeconds: c.durationSeconds ?? 0,
  }));
  await updateSettingsForUser(userId, { archivedCallStats: points });
}
