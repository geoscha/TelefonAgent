import "server-only";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import type { FinanceIntegrationConfig } from "@/lib/admin/finance-integrations";
import { usdToChf } from "@/lib/admin/finance-integrations";
import type { ProviderCostResult } from "@/lib/admin/finance-plugins/twilio-costs";

export interface ElevenLabsCostSeries {
  thisMonth: ProviderCostResult;
  byMonth: Record<string, ProviderCostResult>;
}

export interface ElevenLabsBalanceResult {
  creditsRemaining: number;
  creditsLimit: number;
  creditsUsed: number;
  tier: string;
  source: "api" | "estimate" | "unconfigured";
  error?: string;
}

const TIER_MONTHLY_USD: Record<string, number> = {
  free: 0,
  starter: 5,
  creator: 22,
  pro: 99,
  scale: 330,
  business: 1320,
};

function toChfFromCents(cents: number, currency: string, rate: number): number {
  const amount = cents / 100;
  if (currency === "usd") return usdToChf(amount, rate);
  return amount;
}

function parseUsageCostRows(
  columns: string[] | undefined,
  rows: unknown[][] | undefined,
  rate: number
): number {
  if (!columns?.length || !rows?.length) return 0;

  const costIdx = columns.findIndex((c) =>
    /cost|credit|spend|price|amount/i.test(c)
  );
  if (costIdx < 0) return 0;

  let total = 0;
  for (const row of rows) {
    const val = row[costIdx];
    const n =
      typeof val === "number"
        ? val
        : typeof val === "string"
          ? parseFloat(val)
          : 0;
    if (Number.isFinite(n)) total += n;
  }
  return usdToChf(total, rate);
}

export async function fetchElevenLabsCosts(
  config: FinanceIntegrationConfig,
  monthKeys: string[]
): Promise<ElevenLabsCostSeries> {
  if (!config.elevenLabsApiKey) {
    return {
      thisMonth: { amountChf: 0, source: "unconfigured" },
      byMonth: Object.fromEntries(
        monthKeys.map((m) => [m, { amountChf: 0, source: "unconfigured" }])
      ),
    };
  }

  try {
    const client = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });
    const sub = await client.user.subscription.get();

    let thisMonthChf = 0;
    const currency = String(sub.currency ?? "usd").toLowerCase();

    if (sub.nextInvoice?.amountDueCents) {
      thisMonthChf += toChfFromCents(
        sub.nextInvoice.amountDueCents,
        currency,
        config.usdToChfRate
      );
    } else if (sub.currentOverage?.amount) {
      const overage = parseFloat(sub.currentOverage.amount);
      if (Number.isFinite(overage)) {
        thisMonthChf +=
          String(sub.currentOverage.currency ?? "usd").toLowerCase() === "usd"
            ? usdToChf(overage, config.usdToChfRate)
            : overage;
      }
    } else {
      const tierUsd = TIER_MONTHLY_USD[sub.tier?.toLowerCase() ?? ""] ?? 0;
      thisMonthChf = usdToChf(tierUsd, config.usdToChfRate);
    }

    const byMonth: Record<string, ProviderCostResult> = {};
    for (const key of monthKeys) {
      byMonth[key] = { amountChf: 0, source: "api" };
    }

    const now = Date.now();
    const oldest = monthKeys[0];
    if (oldest) {
      const [y, m] = oldest.split("-").map(Number);
      const startMs = new Date(y, m - 1, 1).getTime();

      try {
        const usage = await client.workspace.usage.getUsageByProductOverTime({
          startTime: startMs,
          endTime: now,
          intervalSeconds: 86400 * 30,
        });

        const cols = usage.columns as string[] | undefined;
        const rows = usage.rows as unknown[][] | undefined;

        if (cols && rows) {
          const dateIdx = cols.findIndex((c) => /date|time|period/i.test(c));
          const costIdx = cols.findIndex((c) =>
            /cost|credit|spend|price|amount/i.test(c)
          );

          if (dateIdx >= 0 && costIdx >= 0) {
            for (const row of rows) {
              const rawDate = row[dateIdx];
              const d =
                rawDate instanceof Date
                  ? rawDate
                  : new Date(String(rawDate ?? ""));
              if (Number.isNaN(d.getTime())) continue;
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              if (!byMonth[key]) continue;
              const val = row[costIdx];
              const n =
                typeof val === "number"
                  ? val
                  : parseFloat(String(val ?? "0"));
              if (!Number.isFinite(n)) continue;
              byMonth[key].amountChf += usdToChf(n, config.usdToChfRate);
            }
          } else {
            const total = parseUsageCostRows(cols, rows, config.usdToChfRate);
            const thisKey = monthKeys[monthKeys.length - 1];
            if (thisKey && total > 0) {
              byMonth[thisKey].amountChf = total;
              thisMonthChf = Math.max(thisMonthChf, total);
            }
          }
        }
      } catch {
        // Workspace analytics optional
      }
    }

    const thisKey = monthKeys[monthKeys.length - 1];
    if (thisKey && byMonth[thisKey]?.amountChf === 0 && thisMonthChf > 0) {
      byMonth[thisKey].amountChf = thisMonthChf;
    }

    return {
      thisMonth: { amountChf: thisMonthChf, source: "api" },
      byMonth,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "ElevenLabs Fehler";
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

export async function fetchElevenLabsBalance(
  config: FinanceIntegrationConfig
): Promise<ElevenLabsBalanceResult> {
  if (!config.elevenLabsApiKey) {
    return {
      creditsRemaining: 0,
      creditsLimit: 0,
      creditsUsed: 0,
      tier: "",
      source: "unconfigured",
    };
  }

  try {
    const client = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });
    const sub = await client.user.subscription.get();
    const limit = sub.characterLimit ?? 0;
    const used = sub.characterCount ?? 0;

    return {
      creditsRemaining: Math.max(0, limit - used),
      creditsLimit: limit,
      creditsUsed: used,
      tier: sub.tier ?? "",
      source: "api",
    };
  } catch (err) {
    return {
      creditsRemaining: 0,
      creditsLimit: 0,
      creditsUsed: 0,
      tier: "",
      source: "api",
      error: err instanceof Error ? err.message : "ElevenLabs Fehler",
    };
  }
}
