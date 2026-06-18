import "server-only";

import type { FinanceIntegrationConfig } from "@/lib/admin/finance-integrations";
import { usdToChf } from "@/lib/admin/finance-integrations";

export type CostSource = "api" | "estimate" | "unconfigured";

export interface ProviderCostResult {
  amountChf: number;
  amountUsd?: number;
  source: CostSource;
  error?: string;
}

export interface TwilioCostSeries {
  thisMonth: ProviderCostResult;
  byMonth: Record<string, ProviderCostResult>;
}

export interface TwilioBalanceResult {
  balanceChf: number;
  balanceUsd: number;
  currency: string;
  source: CostSource;
  error?: string;
}

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

function twilioAuth(config: FinanceIntegrationConfig): string {
  return Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`
  ).toString("base64");
}

async function twilioGet(
  config: FinanceIntegrationConfig,
  path: string
): Promise<Response> {
  return fetch(`${TWILIO_BASE}/Accounts/${config.twilioAccountSid}${path}`, {
    headers: { Authorization: `Basic ${twilioAuth(config)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
}

export async function fetchTwilioCosts(
  config: FinanceIntegrationConfig,
  monthKeys: string[]
): Promise<TwilioCostSeries> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    return {
      thisMonth: { amountChf: 0, source: "unconfigured" },
      byMonth: Object.fromEntries(
        monthKeys.map((m) => [m, { amountChf: 0, source: "unconfigured" }])
      ),
    };
  }

  try {
    const [thisMonthRes, monthlyRes] = await Promise.all([
      twilioGet(
        config,
        "/Usage/Records/ThisMonth.json?Category=totalprice"
      ),
      twilioGet(
        config,
        `/Usage/Records/Monthly.json?Category=totalprice&PageSize=100`
      ),
    ]);

    if (!thisMonthRes.ok) {
      const err = await thisMonthRes.text();
      throw new Error(err.slice(0, 120) || `Twilio ${thisMonthRes.status}`);
    }

    const thisMonthData = (await thisMonthRes.json()) as {
      usage_records?: { price?: string }[];
    };
    const thisMonthUsd = (thisMonthData.usage_records ?? []).reduce(
      (s, r) => s + parseFloat(r.price ?? "0"),
      0
    );

    const byMonth: Record<string, ProviderCostResult> = {};
    for (const key of monthKeys) {
      byMonth[key] = { amountChf: 0, source: "api" };
    }

    if (monthlyRes.ok) {
      const monthlyData = (await monthlyRes.json()) as {
        usage_records?: { price?: string; start_date?: string }[];
      };
      for (const record of monthlyData.usage_records ?? []) {
        if (!record.start_date) continue;
        const key = record.start_date.slice(0, 7);
        if (!byMonth[key]) continue;
        const usd = parseFloat(record.price ?? "0");
        if (!Number.isFinite(usd)) continue;
        byMonth[key].amountChf += usdToChf(usd, config.usdToChfRate);
        byMonth[key].amountUsd = (byMonth[key].amountUsd ?? 0) + usd;
      }
    }

    return {
      thisMonth: {
        amountChf: usdToChf(thisMonthUsd, config.usdToChfRate),
        amountUsd: thisMonthUsd,
        source: "api",
      },
      byMonth,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio Fehler";
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

export async function fetchTwilioBalance(
  config: FinanceIntegrationConfig
): Promise<TwilioBalanceResult> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    return {
      balanceChf: 0,
      balanceUsd: 0,
      currency: "USD",
      source: "unconfigured",
    };
  }

  try {
    const res = await twilioGet(config, "/Balance.json");
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err.slice(0, 120) || `Twilio ${res.status}`);
    }

    const data = (await res.json()) as {
      balance?: string;
      currency?: string;
    };
    const currency = String(data.currency ?? "USD").toUpperCase();
    const raw = parseFloat(data.balance ?? "0");
    const amount = Number.isFinite(raw) ? raw : 0;
    const balanceChf =
      currency === "USD" ? usdToChf(amount, config.usdToChfRate) : amount;

    return {
      balanceChf,
      balanceUsd: currency === "USD" ? amount : 0,
      currency,
      source: "api",
    };
  } catch (err) {
    return {
      balanceChf: 0,
      balanceUsd: 0,
      currency: "USD",
      source: "api",
      error: err instanceof Error ? err.message : "Twilio Fehler",
    };
  }
}
