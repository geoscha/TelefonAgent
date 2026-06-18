import "server-only";

import type { EnrichmentConfig } from "@/lib/admin/enrichment-config";
import { usdToChf } from "@/lib/admin/finance-integrations";
import type { ProviderCostResult } from "@/lib/admin/finance-plugins/twilio-costs";

export interface OpenAiCostSeries {
  thisMonth: ProviderCostResult;
  byMonth: Record<string, ProviderCostResult>;
}

export interface OpenAiSpendResult {
  spendUsd: number;
  spendChf: number;
  source: "api" | "estimate" | "unconfigured";
  error?: string;
}

interface CostBucket {
  object?: string;
  start_time?: number;
  end_time?: number;
  results?: {
    amount?: { value?: number | string; currency?: string };
  }[];
}

function monthRange(key: string): { startSec: number; endSec: number } {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return {
    startSec: Math.floor(start.getTime() / 1000),
    endSec: Math.floor(end.getTime() / 1000),
  };
}

function toUsd(value: number | string | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sumBucketUsd(buckets: CostBucket[]): number {
  let total = 0;
  for (const bucket of buckets) {
    for (const result of bucket.results ?? []) {
      const currency = (result.amount?.currency ?? "usd").toLowerCase();
      const value = toUsd(result.amount?.value);
      if (currency === "usd") total += value;
      else total += value;
    }
  }
  return total;
}

async function fetchOrgCostsUsd(
  config: EnrichmentConfig,
  startSec: number,
  endSec: number
): Promise<number> {
  const base = config.baseUrl.replace(/\/$/, "");
  const buckets: CostBucket[] = [];
  let page: string | null = null;

  for (let guard = 0; guard < 24; guard++) {
    const params = new URLSearchParams({
      start_time: String(startSec),
      end_time: String(endSec),
      bucket_width: "1d",
      limit: "180",
    });
    if (page) params.set("page", page);

    const res = await fetch(`${base}/organization/costs?${params}`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      throw new Error(`OpenAI Costs ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: CostBucket[];
      has_more?: boolean;
      next_page?: string | null;
    };
    buckets.push(...(json.data ?? []));
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }

  return sumBucketUsd(buckets);
}

async function fetchBillingUsageUsd(
  config: EnrichmentConfig,
  startSec: number,
  endSec: number
): Promise<number> {
  const base = config.baseUrl.replace(/\/$/, "");
  const startDate = new Date(startSec * 1000).toISOString().slice(0, 10);
  const endDate = new Date((endSec - 86400) * 1000).toISOString().slice(0, 10);

  const res = await fetch(
    `${base}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
    {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    throw new Error(`OpenAI Billing ${res.status}`);
  }

  const json = (await res.json()) as { total_usage?: number };
  const cents = json.total_usage ?? 0;
  return cents / 100;
}

async function fetchMonthUsd(
  config: EnrichmentConfig,
  startSec: number,
  endSec: number
): Promise<number> {
  try {
    return await fetchOrgCostsUsd(config, startSec, endSec);
  } catch {
    return fetchBillingUsageUsd(config, startSec, endSec);
  }
}

export async function fetchOpenAiCosts(
  config: EnrichmentConfig,
  monthKeys: string[],
  usdToChfRate: number
): Promise<OpenAiCostSeries> {
  if (!config.apiKey) {
    return {
      thisMonth: { amountChf: 0, source: "unconfigured" },
      byMonth: Object.fromEntries(
        monthKeys.map((m) => [m, { amountChf: 0, source: "unconfigured" }])
      ),
    };
  }

  try {
    const byMonth: Record<string, ProviderCostResult> = {};

    await Promise.all(
      monthKeys.map(async (key) => {
        const { startSec, endSec } = monthRange(key);
        const usd = await fetchMonthUsd(config, startSec, endSec);
        const amountChf = usdToChf(usd, usdToChfRate);
        byMonth[key] = {
          amountChf,
          amountUsd: usd,
          source: "api",
        };
      })
    );

    const thisKey = monthKeys[monthKeys.length - 1];
    const thisMonth = thisKey
      ? byMonth[thisKey]
      : { amountChf: 0, source: "api" as const };

    return { thisMonth, byMonth };
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI Fehler";
    return {
      thisMonth: { amountChf: 0, source: "api", error: message },
      byMonth: Object.fromEntries(
        monthKeys.map((m) => [
          m,
          { amountChf: 0, source: "api", error: message },
        ])
      ),
    };
  }
}

/** Current-month spend (same as costs thisMonth, exposed for KPI balance row). */
export async function fetchOpenAiSpend(
  config: EnrichmentConfig,
  usdToChfRate: number
): Promise<OpenAiSpendResult> {
  if (!config.apiKey) {
    return { spendUsd: 0, spendChf: 0, source: "unconfigured" };
  }

  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { startSec, endSec } = monthRange(key);

  try {
    const usd = await fetchMonthUsd(config, startSec, endSec);
    return {
      spendUsd: usd,
      spendChf: usdToChf(usd, usdToChfRate),
      source: "api",
    };
  } catch (err) {
    return {
      spendUsd: 0,
      spendChf: 0,
      source: "api",
      error: err instanceof Error ? err.message : "OpenAI Fehler",
    };
  }
}
