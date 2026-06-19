/** Client-safe token pack types and defaults (no server-only imports). */

export interface TokenPackConfig {
  id: string;
  tokens: number;
  priceChf: number;
  label: string;
  enabled: boolean;
  sortOrder: number;
}

export const STRIPE_MIN_PRICE_CHF = 0.5;

export const DEFAULT_TOKEN_PACKS: TokenPackConfig[] = [
  {
    id: "pack_5k",
    tokens: 5_000,
    priceChf: 0.5,
    label: "5'000 Tokens",
    enabled: true,
    sortOrder: 0,
  },
  {
    id: "pack_20k",
    tokens: 20_000,
    priceChf: 1.0,
    label: "20'000 Tokens",
    enabled: true,
    sortOrder: 1,
  },
];

/** @deprecated Use fetched packs from /api/billing/packs — defaults for legacy fallbacks. */
export const TOKEN_PACKS = DEFAULT_TOKEN_PACKS;

export function stripeUnitAmountFromChf(priceChf: number): number {
  return Math.round(priceChf * 100);
}

export function isValidStripeCheckoutPrice(priceChf: number): boolean {
  return (
    stripeUnitAmountFromChf(priceChf) >= Math.round(STRIPE_MIN_PRICE_CHF * 100)
  );
}

export function formatTokenPackLabel(tokens: number): string {
  return `${tokens.toLocaleString("de-CH")} Tokens`;
}

export function findTokenPack(
  packs: readonly TokenPackConfig[],
  packId: string
): TokenPackConfig | undefined {
  return packs.find((pack) => pack.id === packId);
}
