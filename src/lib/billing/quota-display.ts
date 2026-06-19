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

/** Human-readable agent call time for profile header. */
export function formatAgentUsageDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds === 0) return "0 Sek. im Einsatz";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder} Sek. im Einsatz`;
  if (remainder === 0) return `${minutes} Min. im Einsatz`;
  return `${minutes} Min. ${remainder} Sek. im Einsatz`;
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

/** Token cost to preview the agent greeting (TTS). */
export const GREETING_PREVIEW_COST_TOKENS = 25;

export function formatGreetingPreviewCostLabel(): string {
  return `${formatTokenCount(GREETING_PREVIEW_COST_TOKENS)} Tokens`;
}

export function formatOperationInsufficientTokensMessage(
  balance: number,
  required: number,
  operation: string
): string {
  return `Nicht genügend Tokens (vorhanden: ${formatTokenCount(balance)}, benötigt: ${formatTokenCount(required)} für ${operation}). Bitte laden Sie unter Abrechnung auf.`;
}

/** Token cost per second of call duration. */
export const CALL_SECOND_COST_TOKENS = 10;

export function calculateCallTokenCost(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.round(durationSeconds) * CALL_SECOND_COST_TOKENS;
}

export function formatCallTokenRateLabel(): string {
  return `${formatTokenCount(CALL_SECOND_COST_TOKENS)} Tokens/Sek.`;
}

/** Shown on billing UI — one-time cost to order a phone number (0 = free). */
export const PHONE_NUMBER_MONTHLY_TOKENS = 1800;

export function formatPhoneNumberCostLabel(): string {
  if (PHONE_NUMBER_MONTHLY_TOKENS <= 0) return "kostenlos";
  return `${formatTokenCount(PHONE_NUMBER_MONTHLY_TOKENS)} Tokens pro Monat`;
}

export function formatPhoneNumberBillingAmount(): string | null {
  if (PHONE_NUMBER_MONTHLY_TOKENS <= 0) return null;
  return `${formatTokenCount(PHONE_NUMBER_MONTHLY_TOKENS)} Tokens`;
}

/** Start bonus for new accounts (welcome modal). */
export const WELCOME_TOKEN_AMOUNT = 2_000;

/** Header warning styling when balance falls below the welcome amount. */
export const TOKEN_LOW_BALANCE_THRESHOLD = WELCOME_TOKEN_AMOUNT;

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

export function addOneMonthIso(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export function resolvePhoneNextBillingAt(num: {
  assignedAt?: string;
  nextBillingAt?: string;
}): string | null {
  if (num.nextBillingAt) return num.nextBillingAt;
  if (num.assignedAt) return addOneMonthIso(num.assignedAt);
  return null;
}
