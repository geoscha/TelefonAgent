import "server-only";

import Stripe from "stripe";

import type { FinanceIntegrationConfig } from "@/lib/admin/finance-integrations";
import { usdToChf } from "@/lib/admin/finance-integrations";
import type { ProviderCostResult } from "@/lib/admin/finance-plugins/twilio-costs";

export interface StripeRevenueSeries {
  mrr: ProviderCostResult;
  thisMonth: ProviderCostResult;
  byMonth: Record<string, ProviderCostResult>;
}

const STRIPE_TIMEOUT_MS = 8_000;

function toChf(
  amountMajor: number,
  currency: string,
  usdToChfRate: number
): number {
  if (currency.toLowerCase() === "usd") {
    return usdToChf(amountMajor, usdToChfRate);
  }
  return amountMajor;
}

function chargeRevenueChf(
  charge: Stripe.Charge,
  usdToChfRate: number
): number {
  if (!charge.paid || charge.status !== "succeeded") return 0;
  const refunded = (charge.amount_refunded ?? 0) / 100;
  const gross = (charge.amount ?? 0) / 100;
  const net = Math.max(0, gross - refunded);
  return toChf(net, charge.currency ?? "chf", usdToChfRate);
}

function monthKeyFromUnix(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function withStripeTimeout<T>(
  promise: Promise<T>,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), STRIPE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchStripeMrrChf(
  stripe: Stripe,
  usdToChfRate: number
): Promise<number> {
  let mrr = 0;
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
      expand: ["data.items.data.price"],
      starting_after: startingAfter,
    });

    for (const sub of page.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        if (!price?.unit_amount) continue;
        const qty = item.quantity ?? 1;
        const amountMajor = (price.unit_amount * qty) / 100;
        const chf = toChf(amountMajor, price.currency ?? "chf", usdToChfRate);
        if (price.recurring?.interval === "year") {
          mrr += chf / 12;
        } else {
          mrr += chf;
        }
      }
    }

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  return mrr;
}

/** One paginated Stripe fetch for the whole chart window, grouped by month. */
async function fetchChargesByMonth(
  stripe: Stripe,
  rangeStart: Date,
  rangeEnd: Date,
  monthKeys: string[],
  usdToChfRate: number
): Promise<Record<string, number>> {
  const totals = Object.fromEntries(monthKeys.map((k) => [k, 0])) as Record<
    string,
    number
  >;
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.charges.list({
      created: {
        gte: Math.floor(rangeStart.getTime() / 1000),
        lte: Math.floor(rangeEnd.getTime() / 1000),
      },
      limit: 100,
      starting_after: startingAfter,
    });

    for (const charge of page.data) {
      const key = monthKeyFromUnix(charge.created);
      if (!(key in totals)) continue;
      totals[key] += chargeRevenueChf(charge, usdToChfRate);
    }

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  return totals;
}

export function unconfiguredStripeSeries(
  monthKeys: string[]
): StripeRevenueSeries {
  const zero: ProviderCostResult = { amountChf: 0, source: "unconfigured" };
  return {
    mrr: zero,
    thisMonth: zero,
    byMonth: Object.fromEntries(monthKeys.map((m) => [m, { ...zero }])),
  };
}

function seriesFromTotals(
  monthKeys: string[],
  totals: Record<string, number>,
  mrrChf: number,
  thisMonthKey: string
): StripeRevenueSeries {
  const byMonth = Object.fromEntries(
    monthKeys.map((k) => [
      k,
      { amountChf: totals[k] ?? 0, source: "api" as const },
    ])
  ) as Record<string, ProviderCostResult>;

  return {
    mrr: { amountChf: mrrChf, source: "api" },
    thisMonth: {
      amountChf: totals[thisMonthKey] ?? 0,
      source: "api",
    },
    byMonth,
  };
}

export async function fetchStripeRevenue(
  config: FinanceIntegrationConfig,
  monthKeys: string[],
  monthStarts: Date[]
): Promise<StripeRevenueSeries> {
  const secret = config.stripeSecretKey;
  if (!secret) {
    return unconfiguredStripeSeries(monthKeys);
  }

  const rangeStart = monthStarts[0]!;
  const rangeEnd = new Date();
  rangeEnd.setHours(23, 59, 59, 999);
  const thisMonthKey = monthKeys[monthKeys.length - 1]!;

  try {
    const stripe = new Stripe(secret);
    const usdToChfRate = config.usdToChfRate;

    const result = await withStripeTimeout(
      (async () => {
        const [mrrChf, totals] = await Promise.all([
          fetchStripeMrrChf(stripe, usdToChfRate),
          fetchChargesByMonth(
            stripe,
            rangeStart,
            rangeEnd,
            monthKeys,
            usdToChfRate
          ),
        ]);
        return seriesFromTotals(monthKeys, totals, mrrChf, thisMonthKey);
      })(),
      unconfiguredStripeSeries(monthKeys)
    );

    if (result.mrr.source === "unconfigured") {
      return {
        ...result,
        mrr: {
          amountChf: 0,
          source: "api",
          error: "Stripe-Anfrage hat zu lange gedauert.",
        },
        thisMonth: {
          amountChf: 0,
          source: "api",
          error: "Stripe-Anfrage hat zu lange gedauert.",
        },
      };
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe Fehler";
    const failed: ProviderCostResult = {
      amountChf: 0,
      source: "api",
      error: message,
    };
    return {
      mrr: failed,
      thisMonth: failed,
      byMonth: Object.fromEntries(monthKeys.map((m) => [m, { ...failed }])),
    };
  }
}
