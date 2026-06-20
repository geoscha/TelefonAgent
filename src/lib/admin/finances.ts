import "server-only";

import { getFinanceIntegrations } from "@/lib/admin/finance-integrations";
import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import {
  fetchElevenLabsBalance,
  fetchElevenLabsCosts,
} from "@/lib/admin/finance-plugins/elevenlabs-costs";
import {
  fetchOpenAiCosts,
  fetchOpenAiSpend,
} from "@/lib/admin/finance-plugins/openai-costs";
import { fetchStripeRevenue, fetchStripeChargesByDay } from "@/lib/admin/finance-plugins/stripe-revenue";
import {
  fetchTwilioBalance,
  fetchTwilioCosts,
} from "@/lib/admin/finance-plugins/twilio-costs";
import type { ProviderCostResult } from "@/lib/admin/finance-plugins/twilio-costs";
import { listAdminPoolNumbers } from "@/lib/admin/number-pool";
import { getFinanceConfig } from "@/lib/admin/finance-config";
import { getPlatformTokensSpent } from "@/lib/billing/platform-metrics";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FinanceTimePoint {
  month: string;
  label: string;
  revenueChf: number;
  costChf: number;
  profitChf: number;
  twilioCostChf: number;
  elevenLabsCostChf: number;
  openAiCostChf: number;
  calls: number;
  newSignups: number;
  totalSignups: number;
  proUsers: number;
  retentionPct: number;
}

export interface FinanceProviderStatus {
  amountChf: number;
  source: "api" | "estimate" | "unconfigured";
  error?: string;
}

export interface FinanceProviderBalance {
  twilioBalanceChf?: number;
  twilioBalanceUsd?: number;
  twilioCurrency?: string;
  twilioSource: "api" | "estimate" | "unconfigured";
  twilioError?: string;
  elevenLabsCreditsRemaining?: number;
  elevenLabsCreditsLimit?: number;
  elevenLabsCreditsUsed?: number;
  elevenLabsTier?: string;
  elevenLabsSource: "api" | "estimate" | "unconfigured";
  elevenLabsError?: string;
  openAiSpendUsd?: number;
  openAiSpendChf?: number;
  openAiSource: "api" | "estimate" | "unconfigured";
  openAiError?: string;
}

export interface FinanceDashboard {
  integrations: {
    twilioConfigured: boolean;
    elevenLabsConfigured: boolean;
    stripeConfigured: boolean;
    openAiConfigured: boolean;
  };
  kpis: {
    mrrChf: number;
    monthlyProfitChf: number;
    monthlyCostChf: number;
    totalRevenue12mChf: number;
    totalProfit12mChf: number;
    totalLoss12mChf: number;
    twilioCostChf: number;
    elevenLabsCostChf: number;
    openAiCostChf: number;
    totalSignups: number;
    totalCustomersEver: number;
    deletedCustomers: number;
    proUsers: number;
    retentionPct: number;
    activeUsers30d: number;
    medianAccountLifetimeDays: number | null;
    totalCallMinutes: number;
    totalNumbers: number;
    unusedNumbers: number;
    userValueRatio: number;
    userValueChf: number;
    costPerUserChf: number;
    costPerCallMinuteChf: number | null;
    costPerCallMinuteMonthChf: number | null;
    tokenSpend: TokenSpendStats;
    costPerToken12mChf: number | null;
    revenuePerToken12mChf: number | null;
    grossMarginPct: number;
    unusedNumberCostChf: number;
    profitDeltaChf: number | null;
    revenueDeltaChf: number | null;
    twilio: FinanceProviderStatus;
    elevenLabs: FinanceProviderStatus;
    openAi: FinanceProviderStatus;
    stripe: FinanceProviderStatus;
    balances: FinanceProviderBalance;
  };
  series: FinanceTimePoint[];
  weekSeries: FinanceTimePoint[];
}

interface ProfileRow {
  id: string;
  plan: string;
  created_at: string;
}

interface CustomerRegistryRow {
  id: string;
  created_at: string;
  deleted_at: string | null;
  call_seconds_lifetime: number;
}

interface CallRow {
  user_id: string;
  started_at: string;
  duration_seconds: number;
}

export interface TokenSpendStats {
  /** Cumulative platform-wide debits (persisted, survives user deletion). */
  totalTokensSpent: number;
}

const MONTHS = 12;
const WEEK_DAYS = 7;
const RETENTION_DAYS = 30;

export async function getAdminFinances(): Promise<FinanceDashboard> {
  const config = getFinanceConfig();
  const integrations = await getFinanceIntegrations();
  const enrichment = await getEnrichmentConfig();
  const admin = createAdminClient();

  const monthStarts = Array.from({ length: MONTHS }, (_, i) =>
    monthStart(monthsAgo(MONTHS - 1 - i))
  );
  const monthKeys = monthStarts.map(monthKey);

  const [pool, profilesRes, callsRes, registryRes, platformTokensSpent, twilioCosts, elevenLabsCosts, openAiCosts, twilioBalance, elevenLabsBalance, openAiSpend, stripeRevenue] =
    await Promise.all([
      listAdminPoolNumbers(),
      admin.from("profiles").select("id, plan, created_at"),
      admin.from("calls").select("user_id, started_at, duration_seconds"),
      admin
        .from("customer_registry")
        .select("id, created_at, deleted_at, call_seconds_lifetime"),
      getPlatformTokensSpent(),
      fetchTwilioCosts(integrations, monthKeys),
      fetchElevenLabsCosts(integrations, monthKeys),
      fetchOpenAiCosts(enrichment, monthKeys, integrations.usdToChfRate),
      fetchTwilioBalance(integrations),
      fetchElevenLabsBalance(integrations),
      fetchOpenAiSpend(enrichment, integrations.usdToChfRate),
      fetchStripeRevenue(integrations, monthKeys, monthStarts),
    ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const calls = (callsRes.data ?? []) as CallRow[];
  const registry = registryRes.error
    ? (profiles.map((p) => ({
        id: p.id,
        created_at: p.created_at,
        deleted_at: null as string | null,
        call_seconds_lifetime: 0,
      })) as CustomerRegistryRow[])
    : ((registryRes.data ?? []) as CustomerRegistryRow[]);

  const totalNumbers = pool.length;
  const unusedNumbers = pool.filter((n) => n.status === "frei").length;
  const estimatedNumberCostChf = totalNumbers * config.numberMonthlyChf;

  const now = new Date();
  const activeCutoff = new Date(now);
  activeCutoff.setDate(activeCutoff.getDate() - RETENTION_DAYS);

  const activeUsers30d = new Set(
    calls
      .filter((c) => new Date(c.started_at) >= activeCutoff)
      .map((c) => c.user_id)
  ).size;

  const totalSignups = profiles.length;
  const totalCustomersEver = Math.max(registry.length, totalSignups);
  const deletedCustomers = registry.filter((r) => r.deleted_at).length;

  const lifetimeDays = registry
    .filter((r) => r.deleted_at)
    .map(
      (r) =>
        (new Date(r.deleted_at!).getTime() - new Date(r.created_at).getTime()) /
        (1000 * 60 * 60 * 24)
    )
    .filter((d) => d >= 0);
  const medianAccountLifetimeDays =
    lifetimeDays.length > 0
      ? median(lifetimeDays)
      : medianActiveTenureDays(registry, now);

  const activeCallSeconds = calls.reduce(
    (s, c) => s + (c.duration_seconds ?? 0),
    0
  );
  const archivedCallSeconds = registry
    .filter((r) => r.deleted_at)
    .reduce((s, r) => s + (r.call_seconds_lifetime ?? 0), 0);
  const totalCallMinutes = Math.round(
    (activeCallSeconds + archivedCallSeconds) / 60
  );

  const chartCutoff = monthStart(monthsAgo(MONTHS - 1));
  const chartCalls = calls.filter(
    (c) => new Date(c.started_at) >= chartCutoff
  );

  const tokenSpend: TokenSpendStats = {
    totalTokensSpent: platformTokensSpent,
  };

  const retentionPct =
    totalSignups > 0 ? (activeUsers30d / totalSignups) * 100 : 0;

  const proProfiles = profiles.filter((p) => p.plan === "pro");
  const mrrChf = stripeRevenue.mrr.amountChf;
  const thisMonthRevenueChf = stripeRevenue.thisMonth.amountChf;

  const twilioThisMonth = pickCost(
    twilioCosts.thisMonth,
    estimatedNumberCostChf
  );
  const elevenLabsThisMonth = pickElevenLabsCost(
    elevenLabsCosts.thisMonth,
    calls,
    now,
    config.elevenLabsPerMinuteChf,
    config.elevenLabsPlatformMonthlyChf
  );
  const openAiThisMonth = pickOpenAiCost(openAiCosts.thisMonth);

  const monthlyCostChf =
    twilioThisMonth.amountChf +
    elevenLabsThisMonth.amountChf +
    openAiThisMonth.amountChf;
  const monthlyProfitChf = thisMonthRevenueChf - monthlyCostChf;
  const userValueRatio =
    monthlyCostChf > 0 ? mrrChf / monthlyCostChf : mrrChf > 0 ? Infinity : 0;
  const userValueChf =
    totalCustomersEver > 0 ? mrrChf / totalCustomersEver : 0;
  const costPerUserChf =
    totalCustomersEver > 0 ? monthlyCostChf / totalCustomersEver : 0;

  const series = buildSeries(
    profiles,
    registry,
    chartCalls,
    monthStarts,
    estimatedNumberCostChf,
    config.elevenLabsPerMinuteChf,
    config.elevenLabsPlatformMonthlyChf,
    twilioCosts.byMonth,
    elevenLabsCosts.byMonth,
    openAiCosts.byMonth,
    stripeRevenue.byMonth
  );

  const weekDayStarts = buildRollingWeekStarts(now);
  const weekDayKeys = weekDayStarts.map(dayKey);
  const stripeByDay = await fetchStripeChargesByDay(integrations, weekDayKeys);
  const weekSeries = buildWeekSeries(
    profiles,
    registry,
    calls,
    weekDayStarts,
    estimatedNumberCostChf,
    config.elevenLabsPerMinuteChf,
    config.elevenLabsPlatformMonthlyChf,
    twilioCosts.byMonth,
    elevenLabsCosts.byMonth,
    openAiCosts.byMonth,
    stripeByDay
  );

  const totalRevenue12mChf = series.reduce((s, p) => s + p.revenueChf, 0);
  const totalProfit12mChf = series.reduce((s, p) => s + p.profitChf, 0);
  const totalLoss12mChf = series.reduce((s, p) => s + p.costChf, 0);

  const thisMonthKey = monthKey(now);
  const callMinutesThisMonth =
    calls
      .filter((c) => monthKey(new Date(c.started_at)) === thisMonthKey)
      .reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60;
  const callMinutes12m =
    chartCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60;

  const costPerCallMinuteMonthChf =
    callMinutesThisMonth > 0 ? monthlyCostChf / callMinutesThisMonth : null;
  const costPerCallMinuteChf =
    callMinutes12m > 0
      ? totalLoss12mChf / callMinutes12m
      : costPerCallMinuteMonthChf;

  const costPerToken12mChf =
    tokenSpend.totalTokensSpent > 0
      ? totalLoss12mChf / tokenSpend.totalTokensSpent
      : null;
  const revenuePerToken12mChf =
    tokenSpend.totalTokensSpent > 0
      ? totalRevenue12mChf / tokenSpend.totalTokensSpent
      : null;

  const grossMarginPct =
    thisMonthRevenueChf > 0
      ? (monthlyProfitChf / thisMonthRevenueChf) * 100
      : monthlyProfitChf < 0
        ? -100
        : 0;
  const unusedNumberCostChf = unusedNumbers * config.numberMonthlyChf;

  const priorMonth = series.length >= 2 ? series[series.length - 2] : null;
  const currentMonth = series.length >= 1 ? series[series.length - 1] : null;
  const profitDeltaChf =
    priorMonth && currentMonth
      ? currentMonth.profitChf - priorMonth.profitChf
      : null;
  const revenueDeltaChf =
    priorMonth && currentMonth
      ? currentMonth.revenueChf - priorMonth.revenueChf
      : null;

  return {
    integrations: {
      twilioConfigured: Boolean(
        integrations.twilioAccountSid && integrations.twilioAuthToken
      ),
      elevenLabsConfigured: Boolean(integrations.elevenLabsApiKey),
      stripeConfigured: Boolean(integrations.stripeSecretKey),
      openAiConfigured: Boolean(enrichment.apiKey),
    },
    kpis: {
      mrrChf,
      monthlyProfitChf,
      monthlyCostChf,
      totalRevenue12mChf,
      totalProfit12mChf,
      totalLoss12mChf,
      twilioCostChf: twilioThisMonth.amountChf,
      elevenLabsCostChf: elevenLabsThisMonth.amountChf,
      openAiCostChf: openAiThisMonth.amountChf,
      totalSignups,
      totalCustomersEver,
      deletedCustomers,
      proUsers: proProfiles.length,
      retentionPct,
      activeUsers30d,
      medianAccountLifetimeDays,
      totalCallMinutes,
      totalNumbers,
      unusedNumbers,
      userValueRatio,
      userValueChf,
      costPerUserChf,
      costPerCallMinuteChf,
      costPerCallMinuteMonthChf,
      tokenSpend,
      costPerToken12mChf,
      revenuePerToken12mChf,
      grossMarginPct,
      unusedNumberCostChf,
      profitDeltaChf,
      revenueDeltaChf,
      twilio: {
        amountChf: twilioThisMonth.amountChf,
        source: twilioThisMonth.source,
        error: twilioThisMonth.error,
      },
      elevenLabs: {
        amountChf: elevenLabsThisMonth.amountChf,
        source: elevenLabsThisMonth.source,
        error: elevenLabsThisMonth.error,
      },
      openAi: {
        amountChf: openAiThisMonth.amountChf,
        source: openAiThisMonth.source,
        error: openAiThisMonth.error,
      },
      stripe: {
        amountChf: mrrChf,
        source: stripeRevenue.mrr.source,
        error: stripeRevenue.mrr.error,
      },
      balances: {
        twilioBalanceChf: twilioBalance.balanceChf,
        twilioBalanceUsd: twilioBalance.balanceUsd,
        twilioCurrency: twilioBalance.currency,
        twilioSource: twilioBalance.source,
        twilioError: twilioBalance.error,
        elevenLabsCreditsRemaining: elevenLabsBalance.creditsRemaining,
        elevenLabsCreditsLimit: elevenLabsBalance.creditsLimit,
        elevenLabsCreditsUsed: elevenLabsBalance.creditsUsed,
        elevenLabsTier: elevenLabsBalance.tier,
        elevenLabsSource: elevenLabsBalance.source,
        elevenLabsError: elevenLabsBalance.error,
        openAiSpendUsd: openAiSpend.spendUsd,
        openAiSpendChf: openAiSpend.spendChf,
        openAiSource: openAiSpend.source,
        openAiError: openAiSpend.error,
      },
    },
    series,
    weekSeries,
  };
}

function pickOpenAiCost(api: ProviderCostResult): ProviderCostResult {
  if (api.source === "unconfigured") {
    return { amountChf: 0, source: "unconfigured" };
  }
  return api;
}

function pickCost(
  api: ProviderCostResult,
  fallbackChf: number
): ProviderCostResult {
  if (api.source === "api" && !api.error && api.amountChf > 0) return api;
  if (api.source === "api" && !api.error) return api;
  if (api.source === "unconfigured") {
    return { amountChf: fallbackChf, source: "estimate" };
  }
  if (api.error) {
    return { amountChf: fallbackChf, source: "estimate", error: api.error };
  }
  return api;
}

function pickElevenLabsCost(
  api: ProviderCostResult,
  calls: CallRow[],
  now: Date,
  perMinute: number,
  platform: number
): ProviderCostResult {
  if (api.source === "api" && !api.error && api.amountChf > 0) return api;
  if (api.source === "api" && !api.error && api.amountChf === 0) {
    // API connected but zero — still trust API
    return api;
  }

  const thisMonthKey = monthKey(now);
  const minutes =
    calls
      .filter((c) => monthKey(new Date(c.started_at)) === thisMonthKey)
      .reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60;
  const estimate = minutes * perMinute + platform;

  if (api.source === "unconfigured") {
    return { amountChf: estimate, source: "estimate" };
  }
  return {
    amountChf: api.amountChf > 0 ? api.amountChf : estimate,
    source: api.error ? "estimate" : api.source,
    error: api.error,
  };
}

function buildSeries(
  profiles: ProfileRow[],
  registry: CustomerRegistryRow[],
  calls: CallRow[],
  monthStarts: Date[],
  estimatedNumberCostChf: number,
  elevenLabsPerMinuteChf: number,
  elevenLabsPlatformMonthlyChf: number,
  twilioByMonth: Record<string, ProviderCostResult>,
  elevenLabsByMonth: Record<string, ProviderCostResult>,
  openAiByMonth: Record<string, ProviderCostResult>,
  stripeByMonth: Record<string, ProviderCostResult>
): FinanceTimePoint[] {
  const points: FinanceTimePoint[] = [];

  for (const start of monthStarts) {
    const end = monthEnd(start);
    const key = monthKey(start);

    const monthProfiles = profiles.filter(
      (p) => new Date(p.created_at) <= end
    );
    const proInMonth = monthProfiles.filter((p) => p.plan === "pro");
    const stripeMonth = stripeByMonth[key];
    const revenueChf =
      stripeMonth?.source === "api" && !stripeMonth.error
        ? stripeMonth.amountChf
        : 0;

    const monthCalls = calls.filter((c) => {
      const d = new Date(c.started_at);
      return d >= start && d <= end;
    });
    const callMinutes =
      monthCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60;

    const twilioApi = twilioByMonth[key];
    const elApi = elevenLabsByMonth[key];
    const openAiApi = openAiByMonth[key];
    const twilioCostChf =
      twilioApi?.source === "api" && !twilioApi.error
        ? twilioApi.amountChf
        : estimatedNumberCostChf;
    const elevenLabsCostChf =
      elApi?.source === "api" && !elApi.error && elApi.amountChf > 0
        ? elApi.amountChf
        : callMinutes * elevenLabsPerMinuteChf +
          elevenLabsPlatformMonthlyChf;
    const openAiCostChf =
      openAiApi?.source === "api" && !openAiApi.error
        ? openAiApi.amountChf
        : 0;
    const costChf = twilioCostChf + elevenLabsCostChf + openAiCostChf;

    const newSignups = registry.filter((r) => {
      const d = new Date(r.created_at);
      return d >= start && d <= end;
    }).length;

    const totalSignupsInMonth = registry.filter(
      (r) => new Date(r.created_at) <= end
    ).length;

    const activeInMonth = new Set(monthCalls.map((c) => c.user_id));
    const retentionPct =
      monthProfiles.length > 0
        ? (activeInMonth.size / monthProfiles.length) * 100
        : 0;

    points.push({
      month: key,
      label: start.toLocaleDateString("de-CH", {
        month: "short",
        year: "2-digit",
      }),
      revenueChf,
      costChf,
      profitChf: revenueChf - costChf,
      twilioCostChf,
      elevenLabsCostChf,
      openAiCostChf,
      calls: monthCalls.length,
      newSignups,
      totalSignups: totalSignupsInMonth,
      proUsers: proInMonth.length,
      retentionPct,
    });
  }

  return points;
}

function buildWeekSeries(
  profiles: ProfileRow[],
  registry: CustomerRegistryRow[],
  calls: CallRow[],
  dayStarts: Date[],
  estimatedNumberCostChf: number,
  elevenLabsPerMinuteChf: number,
  elevenLabsPlatformMonthlyChf: number,
  twilioByMonth: Record<string, ProviderCostResult>,
  elevenLabsByMonth: Record<string, ProviderCostResult>,
  openAiByMonth: Record<string, ProviderCostResult>,
  stripeByDay: Record<string, number>
): FinanceTimePoint[] {
  const points: FinanceTimePoint[] = [];

  for (const start of dayStarts) {
    const end = dayEnd(start);
    const key = dayKey(start);
    const month = monthKey(start);
    const daysInMonth = daysInCalendarMonth(start);

    const monthProfiles = profiles.filter(
      (p) => new Date(p.created_at) <= end
    );
    const proInMonth = monthProfiles.filter((p) => p.plan === "pro");

    const dayCalls = calls.filter((c) => {
      const d = new Date(c.started_at);
      return d >= start && d <= end;
    });
    const callMinutes =
      dayCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60;

    const revenueChf = stripeByDay[key] ?? 0;

    const twilioApi = twilioByMonth[month];
    const elApi = elevenLabsByMonth[month];
    const openAiApi = openAiByMonth[month];

    const twilioMonthlyChf =
      twilioApi?.source === "api" && !twilioApi.error
        ? twilioApi.amountChf
        : estimatedNumberCostChf;
    const twilioCostChf = twilioMonthlyChf / daysInMonth;

    const elevenLabsMonthlyChf =
      elApi?.source === "api" && !elApi.error && elApi.amountChf > 0
        ? elApi.amountChf
        : callMinutes * elevenLabsPerMinuteChf +
          elevenLabsPlatformMonthlyChf;
    const elevenLabsCostChf =
      elApi?.source === "api" && !elApi.error && elApi.amountChf > 0
        ? elevenLabsMonthlyChf / daysInMonth
        : callMinutes * elevenLabsPerMinuteChf +
          elevenLabsPlatformMonthlyChf / daysInMonth;

    const openAiMonthlyChf =
      openAiApi?.source === "api" && !openAiApi.error
        ? openAiApi.amountChf
        : 0;
    const openAiCostChf = openAiMonthlyChf / daysInMonth;

    const costChf = twilioCostChf + elevenLabsCostChf + openAiCostChf;

    const newSignups = registry.filter((r) => {
      const d = new Date(r.created_at);
      return d >= start && d <= end;
    }).length;

    const totalSignupsInDay = registry.filter(
      (r) => new Date(r.created_at) <= end
    ).length;

    const activeInDay = new Set(dayCalls.map((c) => c.user_id));
    const retentionPct =
      monthProfiles.length > 0
        ? (activeInDay.size / monthProfiles.length) * 100
        : 0;

    points.push({
      month: key,
      label: start.toLocaleDateString("de-CH", {
        weekday: "short",
        day: "2-digit",
      }),
      revenueChf,
      costChf,
      profitChf: revenueChf - costChf,
      twilioCostChf,
      elevenLabsCostChf,
      openAiCostChf,
      calls: dayCalls.length,
      newSignups,
      totalSignups: totalSignupsInDay,
      proUsers: proInMonth.length,
      retentionPct,
    });
  }

  return points;
}

function buildRollingWeekStarts(now: Date): Date[] {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const day = new Date(base);
    day.setDate(day.getDate() - (WEEK_DAYS - 1 - i));
    return day;
  });
}

function dayEnd(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInCalendarMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function medianActiveTenureDays(
  registry: CustomerRegistryRow[],
  now: Date
): number | null {
  const active = registry
    .filter((r) => !r.deleted_at)
    .map(
      (r) =>
        (now.getTime() - new Date(r.created_at).getTime()) /
        (1000 * 60 * 60 * 24)
    )
    .filter((d) => d >= 0);
  return active.length > 0 ? median(active) : null;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - n);
  return d;
}

function monthStart(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthEnd(d: Date): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1);
  x.setDate(0);
  x.setHours(23, 59, 59, 999);
  return x;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
