"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { FinanceChart } from "@/components/admin/FinanceChart";
import { AdminStat, adminPanelClass } from "@/components/admin/admin-ui";
import { buildExecutiveBriefing } from "@/lib/admin/finance-insights";
import { cn } from "@/lib/utils";

interface FinanceTimePoint {
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

interface ProviderStatus {
  amountChf: number;
  source: "api" | "estimate" | "unconfigured";
  error?: string;
}

export interface FinanceDashboardData {
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
    grossMarginPct: number;
    unusedNumberCostChf: number;
    profitDeltaChf: number | null;
    revenueDeltaChf: number | null;
    tokenSpend: { totalTokensSpent: number };
    costPerToken12mChf: number | null;
    revenuePerToken12mChf: number | null;
    twilio: ProviderStatus;
    elevenLabs: ProviderStatus;
    openAi: ProviderStatus;
    stripe: ProviderStatus;
    balances: {
      twilioBalanceChf?: number;
      twilioBalanceUsd?: number;
      twilioCurrency?: string;
      twilioSource: ProviderStatus["source"];
      elevenLabsCreditsRemaining?: number;
      elevenLabsCreditsLimit?: number;
      elevenLabsTier?: string;
      elevenLabsSource: ProviderStatus["source"];
      openAiSpendChf?: number;
      openAiSpendUsd?: number;
      openAiSource: ProviderStatus["source"];
    };
  };
  series: FinanceTimePoint[];
  weekSeries: FinanceTimePoint[];
}

function chf(value: number, decimals = 0): string {
  return `CHF ${value.toLocaleString("de-CH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function pct(value: number): string {
  return `${value.toLocaleString("de-CH", { maximumFractionDigits: 1 })}%`;
}

function deltaLabel(value: number | null, prefix = "CHF"): string | null {
  if (value == null || value === 0) return null;
  const sign = value > 0 ? "+" : "−";
  return `${sign}${prefix} ${Math.abs(value).toLocaleString("de-CH", { maximumFractionDigits: 0 })}`;
}

const SLICE_COLORS: Record<string, string> = {
  twilio: "#ef4444",
  elevenlabs: "#f59e0b",
  openai: "#10b981",
};

type ChartRange = "week" | "month";

function buildChartSeries(points: FinanceTimePoint[]) {
  return [
    {
      key: "profit",
      label: "Ergebnis",
      color: "#16a34a",
      values: points.map((p) => p.profitChf),
    },
  ];
}

function dayTooltipLabel(point: FinanceTimePoint): string {
  const date = new Date(`${point.month}T12:00:00`);
  return date.toLocaleDateString("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function FinanceExecutiveDashboard({
  data,
  loading,
}: {
  data: FinanceDashboardData;
  loading?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>("month");
  const k = data.kpis;

  const briefing = useMemo(
    () =>
      buildExecutiveBriefing({
        mrrChf: k.mrrChf,
        monthlyProfitChf: k.monthlyProfitChf,
        monthlyCostChf: k.monthlyCostChf,
        twilioCostChf: k.twilioCostChf,
        elevenLabsCostChf: k.elevenLabsCostChf,
        openAiCostChf: k.openAiCostChf,
        unusedNumbers: k.unusedNumbers,
        totalNumbers: k.totalNumbers,
        unusedNumberCostChf: k.unusedNumberCostChf,
        costPerUserChf: k.costPerUserChf,
        userValueChf: k.userValueChf,
        retentionPct: k.retentionPct,
        totalCustomersEver: k.totalCustomersEver,
        activeUsers30d: k.activeUsers30d,
        profitDeltaChf: k.profitDeltaChf,
        revenueDeltaChf: k.revenueDeltaChf,
        stripeConfigured: data.integrations.stripeConfigured,
      }),
    [data.integrations.stripeConfigured, k]
  );

  const activePoints =
    chartRange === "week" ? (data.weekSeries ?? []) : data.series;
  const chartLabels = activePoints.map((p) => p.label);
  const chartSeries = buildChartSeries(activePoints);

  const profitPositive = k.monthlyProfitChf >= 0;

  return (
    <div className="space-y-4">
      {!data.integrations.stripeConfigured && (
        <p className="landing-caption text-[#525866]">
          <Link href="/admin/settings" className="text-[#335cff] hover:underline">
            Stripe verbinden
          </Link>{" "}
          für vollständige Umsatz- und Margenansicht.
        </p>
      )}

      <section className={`${adminPanelClass} p-4 sm:p-5`}>
        <p className="landing-caption text-[#99A0AE]">Geschäftsführung</p>
        <h2 className="mt-1 landing-body text-lg font-medium text-[#0E121B]">
          {briefing.headline}
        </h2>
        <p className="mt-2 max-w-3xl landing-body text-[#525866]">
          {briefing.summary}
        </p>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <HeroMetric
          label="Umsatz (MRR)"
          value={chf(k.mrrChf)}
          delta={deltaLabel(k.revenueDeltaChf)}
          positive={k.revenueDeltaChf == null || k.revenueDeltaChf >= 0}
        />
        <HeroMetric
          label="Kosten (Monat)"
          value={chf(k.monthlyCostChf)}
          hint="Variable Infrastruktur"
        />
        <HeroMetric
          label="Ergebnis (Monat)"
          value={chf(k.monthlyProfitChf)}
          delta={deltaLabel(k.profitDeltaChf)}
          positive={profitPositive}
          accent={profitPositive}
          accentNegative={!profitPositive}
        />
        <HeroMetric
          label="Marge"
          value={pct(k.grossMarginPct)}
          hint={k.grossMarginPct >= 30 ? "Gesund" : k.grossMarginPct >= 0 ? "Beobachten" : "Kritisch"}
          positive={k.grossMarginPct >= 20}
          accentNegative={k.grossMarginPct < 0}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className={`${adminPanelClass} p-4 lg:col-span-2`}>
          <p className="landing-caption text-[#525866]">Kostenstruktur</p>
          <p className="mt-0.5 landing-body font-medium text-[#0E121B]">
            {chf(k.monthlyCostChf)} / Monat
          </p>
          <div className="mt-4 space-y-3">
            {briefing.costSlices.map((slice) => (
              <div key={slice.key}>
                <div className="mb-1 flex items-center justify-between gap-2 landing-caption">
                  <span className="text-[#525866]">{slice.label}</span>
                  <span className="tabular-nums text-[#0E121B]">
                    {chf(slice.amountChf, 0)}{" "}
                    <span className="text-[#99A0AE]">
                      ({slice.sharePct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#F5F7FA]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, slice.sharePct)}%`,
                      backgroundColor: SLICE_COLORS[slice.key],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${adminPanelClass} p-4 lg:col-span-3`}>
          <p className="landing-caption text-[#525866]">Handlungsfelder</p>
          {briefing.alerts.length === 0 ? (
            <p className="mt-3 landing-body text-[#525866]">
              Keine kritischen Abweichungen — weiter beobachten.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {briefing.alerts.map((alert) => (
                <li
                  key={alert.title}
                  className={cn(
                    "landing-radius-sm border px-3 py-2.5",
                    alert.severity === "high"
                      ? "border-red-200 bg-red-50/60"
                      : alert.severity === "medium"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-[#E1E4EA] bg-[#F5F7FA]/50"
                  )}
                >
                  <div className="flex gap-2">
                    <AlertTriangle
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        alert.severity === "high"
                          ? "text-red-600"
                          : alert.severity === "medium"
                            ? "text-amber-600"
                            : "text-[#525866]"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="landing-body font-medium text-[#0E121B]">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 landing-caption text-[#525866]">
                        {alert.detail}
                      </p>
                      {alert.action && (
                        <p className="mt-1 landing-caption text-[#335cff]">
                          → {alert.action}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={`${adminPanelClass} p-4`}>
        <p className="mb-3 landing-caption text-[#525866]">
          Ergebnisrechnung (aktueller Monat)
        </p>
        <table className="w-full landing-body">
          <tbody className="divide-y divide-[#E1E4EA]">
            <PnLRow label="Umsatz (MRR)" value={chf(k.mrrChf)} bold />
            <PnLRow label="− Twilio" value={chf(k.twilioCostChf, 2)} muted />
            <PnLRow label="− ElevenLabs" value={chf(k.elevenLabsCostChf, 2)} muted />
            <PnLRow label="− OpenAI" value={chf(k.openAiCostChf, 2)} muted />
            <PnLRow label="= Ergebnis" value={chf(k.monthlyProfitChf)} bold accent={profitPositive} accentNegative={!profitPositive} />
          </tbody>
        </table>
      </section>

      <section className={`${adminPanelClass} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="landing-caption text-[#525866]">
            {chartRange === "week" ? "Letzte 7 Tage" : "12 Monate"}
          </p>
          <div className="inline-flex rounded-lg border border-[#E1E4EA] bg-[#F5F7FA] p-0.5">
            <ChartRangeButton
              active={chartRange === "week"}
              onClick={() => setChartRange("week")}
            >
              Woche
            </ChartRangeButton>
            <ChartRangeButton
              active={chartRange === "month"}
              onClick={() => setChartRange("month")}
            >
              Monat
            </ChartRangeButton>
          </div>
        </div>
        <FinanceChart
          labels={chartLabels}
          series={chartSeries}
          loading={loading}
          formatValue={(n, key) => {
            if (key === "profit" && n < 0) return `−${chf(Math.abs(n))}`;
            return chf(n);
          }}
          extraTooltip={
            chartRange === "week"
              ? (index) => {
                  const point = activePoints[index];
                  if (!point) return [];
                  return [
                    { label: "Datum", value: dayTooltipLabel(point) },
                    { label: "Anrufe", value: String(point.calls) },
                    { label: "Neukunden", value: String(point.newSignups) },
                    { label: "Twilio", value: chf(point.twilioCostChf, 2) },
                    {
                      label: "ElevenLabs",
                      value: chf(point.elevenLabsCostChf, 2),
                    },
                    { label: "OpenAI", value: chf(point.openAiCostChf, 2) },
                  ];
                }
              : undefined
          }
        />
      </section>

      <section className={`${adminPanelClass} overflow-hidden`}>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#F5F7FA]/60"
        >
          <span className="landing-body font-medium text-[#0E121B]">
            Details & Kennzahlen
          </span>
          {detailsOpen ? (
            <ChevronUp className="h-4 w-4 text-[#525866]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#525866]" />
          )}
        </button>
        {detailsOpen && (
          <div className="space-y-4 border-t border-[#E1E4EA] p-4">
            <DetailSection title="Jahresergebnis">
              <AdminStat label="Umsatz (12M)" value={chf(k.totalRevenue12mChf)} />
              <AdminStat label="Kosten (12M)" value={chf(k.totalLoss12mChf)} />
              <AdminStat
                label="Ergebnis (12M)"
                value={chf(k.totalProfit12mChf)}
                accent={k.totalProfit12mChf >= 0}
              />
              <AdminStat
                label="Kosten/Minute"
                value={
                  k.costPerCallMinuteMonthChf != null
                    ? chf(k.costPerCallMinuteMonthChf, 3)
                    : "—"
                }
              />
            </DetailSection>

            <DetailSection title="Unit Economics">
              <AdminStat label="Umsatz/Kunde" value={chf(k.userValueChf, 2)} />
              <AdminStat label="Kosten/Kunde" value={chf(k.costPerUserChf, 2)} />
              <AdminStat
                label="Value Ratio"
                value={
                  Number.isFinite(k.userValueRatio)
                    ? `${k.userValueRatio.toFixed(2)}×`
                    : "∞"
                }
              />
              <AdminStat label="Pro-Kunden" value={String(k.proUsers)} />
            </DetailSection>

            <DetailSection title="Kunden">
              <AdminStat label="Kunden gesamt" value={String(k.totalCustomersEver)} />
              <AdminStat label="Aktiv (30d)" value={String(k.activeUsers30d)} />
              <AdminStat label="Retention" value={pct(k.retentionPct)} />
              <AdminStat label="Telefonminuten" value={String(k.totalCallMinutes)} />
            </DetailSection>

            <DetailSection title="Liquidität & APIs">
              <AdminStat
                label="Twilio Guthaben"
                value={chf(k.balances.twilioBalanceChf ?? 0, 2)}
              />
              <AdminStat
                label="ElevenLabs Credits"
                value={String(k.balances.elevenLabsCreditsRemaining ?? "—")}
              />
              <AdminStat
                label="OpenAI (Monat)"
                value={chf(k.balances.openAiSpendChf ?? 0, 2)}
              />
              <AdminStat
                label="Nummern (frei)"
                value={`${k.unusedNumbers} / ${k.totalNumbers}`}
                hint={
                  k.unusedNumberCostChf > 0
                    ? `~${chf(k.unusedNumberCostChf, 0)} Leerstand/Mt.`
                    : undefined
                }
              />
            </DetailSection>
          </div>
        )}
      </section>
    </div>
  );
}

function ChartRangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 landing-caption transition-colors",
        active
          ? "bg-white text-[#0E121B] shadow-sm"
          : "text-[#525866] hover:text-[#0E121B]"
      )}
    >
      {children}
    </button>
  );
}

function HeroMetric({
  label,
  value,
  hint,
  delta,
  positive,
  accent,
  accentNegative,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string | null;
  positive?: boolean;
  accent?: boolean;
  accentNegative?: boolean;
}) {
  return (
    <div
      className={cn(
        "landing-radius border px-4 py-3",
        accentNegative
          ? "border-red-200 bg-red-50/40"
          : accent
            ? "border-[#335cff]/25 bg-[#335cff]/5"
            : "border-[#E1E4EA] bg-white"
      )}
    >
      <p className="landing-caption text-[#525866]">{label}</p>
      <p className="mt-1 landing-body text-xl font-medium tabular-nums text-[#0E121B]">
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 landing-caption",
            positive ? "text-green-700" : "text-red-600"
          )}
        >
          {positive ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {delta} vs. Vormonat
        </p>
      )}
      {hint && !delta && (
        <p className="mt-1 landing-caption text-[#99A0AE]">{hint}</p>
      )}
    </div>
  );
}

function PnLRow({
  label,
  value,
  bold,
  muted,
  accent,
  accentNegative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
  accentNegative?: boolean;
}) {
  return (
    <tr>
      <td
        className={cn(
          "py-2 pr-4",
          bold ? "font-medium text-[#0E121B]" : muted ? "text-[#525866]" : "text-[#0E121B]"
        )}
      >
        {label}
      </td>
      <td
        className={cn(
          "py-2 text-right tabular-nums",
          bold && "font-medium",
          accentNegative ? "text-red-600" : accent ? "text-green-700" : "text-[#0E121B]"
        )}
      >
        {value}
      </td>
    </tr>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="landing-caption text-[#99A0AE]">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}
