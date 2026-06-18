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

/** Big stat for welcome / profile banner (minutes or seconds remaining). */
export function quotaRemainingHighlight(quota: CallQuotaView): {
  value: string;
  suffix: string;
} {
  const { remainingSeconds } = quota;
  if (remainingSeconds <= 0) {
    return { value: "0", suffix: "Min. frei" };
  }
  if (remainingSeconds < 60) {
    return { value: String(remainingSeconds), suffix: "Sek. frei" };
  }
  return {
    value: String(Math.floor(remainingSeconds / 60)),
    suffix: "Min. frei",
  };
}
