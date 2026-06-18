/** Client-safe token display (no server-only imports). */

export interface TokenBalanceView {
  balance: number;
  exhausted: boolean;
  phonePaused: boolean;
  /** ISO timestamp when phones were paused due to empty balance. */
  phonePausedAt?: string;
}

export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString("de-CH");
}

/** @deprecated Minute quota — kept for legacy UsageRing component. */
export function formatQuotaDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s} Sek.`;
  if (s === 0) return `${m} Min.`;
  return `${m}:${String(s).padStart(2, "0")} Min.`;
}

/** Big stat for welcome / profile banner. */
export function tokenBalanceHighlight(view: TokenBalanceView): {
  value: string;
  suffix: string;
} {
  return {
    value: formatTokenCount(Math.max(0, view.balance)),
    suffix: view.phonePaused ? "Tokens (pausiert)" : "Tokens",
  };
}

/** Public token packs shown on billing (prices only — no per-token rate). */
export const TOKEN_PACKS = [
  {
    id: "pack_5k",
    tokens: 5_000,
    priceChf: 10,
    label: "5'000 Tokens",
  },
  {
    id: "pack_20k",
    tokens: 20_000,
    priceChf: 35,
    label: "20'000 Tokens",
  },
  {
    id: "pack_100k",
    tokens: 100_000,
    priceChf: 130,
    label: "100'000 Tokens",
  },
] as const;

/** Shown on billing UI — monthly cost per phone number. */
export const PHONE_NUMBER_MONTHLY_TOKENS = 1_800;

export function getTokenPack(packId: string) {
  return TOKEN_PACKS.find((p) => p.id === packId);
}

export function formatBillingDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
