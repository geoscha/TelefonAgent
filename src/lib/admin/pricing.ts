import type { BillingInterval } from "@/lib/store";

/** CHF amounts (in Rappen) for the Pro plan — shared with Stripe checkout. */
export const PRO_PRICING_CHF: Record<
  BillingInterval,
  { amount: number; interval: "month" | "year" }
> = {
  monthly: { amount: 5000, interval: "month" },
  yearly: { amount: 100000, interval: "year" },
};

export function proMonthlyRevenueChf(
  billingInterval?: BillingInterval | null
): number {
  if (billingInterval === "yearly") return PRO_PRICING_CHF.yearly.amount / 100 / 12;
  return PRO_PRICING_CHF.monthly.amount / 100;
}
