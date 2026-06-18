/** Client-safe quota formatting (no server-only imports). */

export const FREE_CALL_SECONDS_LIMIT = 20;
export const PRO_CALL_SECONDS_LIMIT = 60 * 60;

export function formatQuotaDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s} Sek.`;
  if (s === 0) return `${m} Min.`;
  return `${m}:${String(s).padStart(2, "0")} Min.`;
}

export interface CallQuotaView {
  plan: "free" | "pro";
  usedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
  percentUsed: number;
  exhausted: boolean;
  periodLabel: string;
  resetsAt?: string;
}
