"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FinanceChart } from "@/components/admin/FinanceChart";
import { Button } from "@/components/ui/button";

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

interface FinanceData {
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
    twilio: ProviderStatus;
    elevenLabs: ProviderStatus;
    openAi: ProviderStatus;
    stripe: ProviderStatus;
    balances: {
      twilioBalanceChf?: number;
      twilioBalanceUsd?: number;
      twilioCurrency?: string;
      twilioSource: ProviderStatus["source"];
      twilioError?: string;
      elevenLabsCreditsRemaining?: number;
      elevenLabsCreditsLimit?: number;
      elevenLabsCreditsUsed?: number;
      elevenLabsTier?: string;
      elevenLabsSource: ProviderStatus["source"];
      elevenLabsError?: string;
      openAiSpendUsd?: number;
      openAiSpendChf?: number;
      openAiSource: ProviderStatus["source"];
      openAiError?: string;
    };
  };
  series: FinanceTimePoint[];
}

type ChartView = "pnl" | "users" | "costs";

const CHART_VIEWS: { id: ChartView; label: string }[] = [
  { id: "pnl", label: "Umsatz & Gewinn" },
  { id: "users", label: "Nutzer" },
  { id: "costs", label: "Kosten" },
];

function chf(value: number, decimals = 0): string {
  return `CHF ${value.toLocaleString("de-CH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function pct(value: number): string {
  return `${value.toLocaleString("de-CH", { maximumFractionDigits: 1 })}%`;
}

function ratio(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return `${value.toLocaleString("de-CH", { maximumFractionDigits: 2 })}×`;
}

function minutes(value: number): string {
  if (value >= 60) {
    const h = Math.floor(value / 60);
    const m = value % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${value.toLocaleString("de-CH")} min`;
}

function lifetimeDays(value: number | null): string {
  if (value == null) return "—";
  if (value < 14) {
    return `${Math.round(value)} Tage`;
  }
  const months = value / 30.44;
  if (months < 24) {
    return `${months.toLocaleString("de-CH", { maximumFractionDigits: 1 })} Mon.`;
  }
  const years = value / 365.25;
  return `${years.toLocaleString("de-CH", { maximumFractionDigits: 1 })} Jahre`;
}

function credits(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("de-CH", { maximumFractionDigits: 1 })}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("de-CH", { maximumFractionDigits: 1 })}k`;
  }
  return value.toLocaleString("de-CH");
}

function costPerMinute(
  total: number | null,
  month: number | null
): { value: string; hint?: string } {
  if (total == null && month == null) return { value: "—" };
  if (total != null) {
    return {
      value: chf(total, 3),
      hint: month != null ? `Monat: ${chf(month, 3)}` : "12 Monate",
    };
  }
  return { value: chf(month!, 3), hint: "Aktueller Monat" };
}

function twilioBalanceLabel(k: FinanceData["kpis"]): { value: string; hint?: string } {
  const b = k.balances;
  if (b.twilioSource === "unconfigured") return { value: "—", hint: "API fehlt" };
  if (b.twilioError) return { value: "—", hint: b.twilioError };
  const usd =
    b.twilioCurrency === "USD" && b.twilioBalanceUsd != null
      ? `$${b.twilioBalanceUsd.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
  return {
    value: chf(b.twilioBalanceChf ?? 0, 2),
    hint: usd ?? undefined,
  };
}

function elevenLabsCreditsLabel(k: FinanceData["kpis"]): { value: string; hint?: string } {
  const b = k.balances;
  if (b.elevenLabsSource === "unconfigured") return { value: "—", hint: "API fehlt" };
  if (b.elevenLabsError) return { value: "—", hint: b.elevenLabsError };
  const remaining = b.elevenLabsCreditsRemaining ?? 0;
  const limit = b.elevenLabsCreditsLimit ?? 0;
  const tier = b.elevenLabsTier ? b.elevenLabsTier : undefined;
  return {
    value: credits(remaining),
    hint: tier
      ? `${credits(remaining)} / ${credits(limit)} · ${tier}`
      : `${credits(remaining)} / ${credits(limit)} Credits`,
  };
}

function openAiSpendLabel(k: FinanceData["kpis"]): { value: string; hint?: string } {
  const b = k.balances;
  if (b.openAiSource === "unconfigured") {
    return { value: "—", hint: "KI-Key in Einstellungen" };
  }
  if (b.openAiError) return { value: "—", hint: b.openAiError };
  const usd =
    b.openAiSpendUsd != null
      ? `$${b.openAiSpendUsd.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
  return {
    value: chf(b.openAiSpendChf ?? 0, 2),
    hint: usd ? `${usd} · Monat` : "Monat",
  };
}

function sourceLabel(source: ProviderStatus["source"]): string {
  if (source === "api") return "API";
  if (source === "estimate") return "Schätzung";
  return "—";
}

export default function AdminFinancesPage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartView, setChartView] = useState<ChartView>("pnl");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/finances");
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json as FinanceData);
      } else {
        toast.error("Finanzdaten konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const labels = useMemo(
    () => data?.series.map((p) => p.label) ?? [],
    [data]
  );

  const chartSeries = useMemo(() => {
    if (!data) return [];
    const s = data.series;
    switch (chartView) {
      case "pnl":
        return [
          {
            key: "revenue",
            label: "Umsatz",
            color: "var(--accent)",
            values: s.map((p) => p.revenueChf),
          },
          {
            key: "profit",
            label: "Gewinn",
            color: "#16a34a",
            values: s.map((p) => p.profitChf),
          },
          {
            key: "loss",
            label: "Kosten",
            color: "#ef4444",
            values: s.map((p) => -p.costChf),
          },
        ];
      case "users":
        return [
          {
            key: "total",
            label: "Kunden gesamt",
            color: "var(--accent)",
            values: s.map((p) => p.totalSignups),
          },
          {
            key: "pro",
            label: "Pro",
            color: "#16a34a",
            values: s.map((p) => p.proUsers),
          },
          {
            key: "new",
            label: "Neu",
            color: "#94a3b8",
            values: s.map((p) => p.newSignups),
          },
        ];
      case "costs":
        return [
          {
            key: "twilio",
            label: "Twilio",
            color: "#ef4444",
            values: s.map((p) => p.twilioCostChf),
          },
          {
            key: "el",
            label: "ElevenLabs",
            color: "#f59e0b",
            values: s.map((p) => p.elevenLabsCostChf),
          },
          {
            key: "openai",
            label: "OpenAI",
            color: "#10b981",
            values: s.map((p) => p.openAiCostChf),
          },
          {
            key: "total",
            label: "Gesamt",
            color: "var(--accent)",
            values: s.map((p) => p.costChf),
          },
        ];
    }
  }, [chartView, data]);

  const formatChartValue = useMemo(() => {
    if (chartView === "users") {
      return (n: number) => String(Math.round(n));
    }
    if (chartView === "pnl") {
      return (n: number, key?: string) => {
        const prefix = key === "loss" || n < 0 ? "−" : "";
        return `${prefix}${chf(Math.abs(n))}`;
      };
    }
    return (n: number) => chf(n);
  }, [chartView]);

  const k = data?.kpis;
  const perMinute = k
    ? costPerMinute(k.costPerCallMinuteChf, k.costPerCallMinuteMonthChf)
    : null;
  const twilioBal = k ? twilioBalanceLabel(k) : null;
  const elCredits = k ? elevenLabsCreditsLabel(k) : null;
  const openAiSpend = k ? openAiSpendLabel(k) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Finanzen</h1>
        {data &&
          (!data.integrations.twilioConfigured ||
            !data.integrations.elevenLabsConfigured ||
            !data.integrations.stripeConfigured ||
            !data.integrations.openAiConfigured) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/settings">APIs verbinden</Link>
            </Button>
          )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-24 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : k ? (
        <>
          <div className="rounded-card border border-stroke bg-surface p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-navy">12 Monate</p>
              <div className="inline-flex rounded-full border border-stroke bg-bg p-1">
                {CHART_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setChartView(v.id)}
                    className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                      chartView === v.id
                        ? "bg-accent text-white"
                        : "text-text-muted hover:text-navy"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <FinanceChart
              labels={labels}
              series={chartSeries}
              loading={loading}
              formatValue={formatChartValue}
            />
          </div>

          <KpiSection title="Nutzer">
            <Stat label="Kunden gesamt" value={String(k.totalCustomersEver)} />
            <Stat label="Aktiv" value={String(k.totalSignups)} />
            <Stat label="Gelöscht" value={String(k.deletedCustomers)} />
            <Stat label="Pro" value={String(k.proUsers)} />
            <Stat label="Aktiv (30d)" value={String(k.activeUsers30d)} />
            <Stat label="Retention" value={pct(k.retentionPct)} />
            <Stat
              label="Typische Laufzeit"
              value={lifetimeDays(k.medianAccountLifetimeDays)}
            />
            <Stat label="Telefonminuten" value={minutes(k.totalCallMinutes)} />
          </KpiSection>

          <KpiSection title="Gewinn">
            <Stat
              label="MRR"
              value={chf(k.mrrChf)}
              hint={sourceLabel(k.stripe.source)}
            />
            <Stat label="Gewinn (Monat)" value={chf(k.monthlyProfitChf)} />
            <Stat label="Gewinn (12M)" value={chf(k.totalProfit12mChf)} />
            <Stat
              label="Umsatz (12M)"
              value={chf(k.totalRevenue12mChf)}
              hint={
                k.stripe.source === "unconfigured"
                  ? "Stripe nicht verbunden"
                  : sourceLabel(k.stripe.source)
              }
            />
            <Stat label="User Value" value={ratio(k.userValueRatio)} />
            <Stat label="Umsatz/Kunde" value={chf(k.userValueChf, 2)} />
          </KpiSection>

          <KpiSection title="Kosten">
            <Stat
              label="Kosten/Minute"
              value={perMinute?.value ?? "—"}
              hint={perMinute?.hint}
            />
            <Stat label="Kosten (Monat)" value={chf(k.monthlyCostChf)} />
            <Stat label="Kosten (12M)" value={chf(k.totalLoss12mChf)} />
            <Stat label="Kosten/Kunde" value={chf(k.costPerUserChf, 2)} />
            <Stat
              label="Twilio Guthaben"
              value={twilioBal?.value ?? "—"}
              hint={twilioBal?.hint}
            />
            <Stat
              label="ElevenLabs Credits"
              value={elCredits?.value ?? "—"}
              hint={elCredits?.hint}
            />
            <Stat
              label="OpenAI Spend"
              value={openAiSpend?.value ?? "—"}
              hint={openAiSpend?.hint}
            />
            <Stat
              label="Twilio (Monat)"
              value={chf(k.twilioCostChf, 2)}
              hint={sourceLabel(k.twilio.source)}
            />
            <Stat
              label="ElevenLabs (Monat)"
              value={chf(k.elevenLabsCostChf, 2)}
              hint={sourceLabel(k.elevenLabs.source)}
            />
            <Stat
              label="OpenAI (Monat)"
              value={chf(k.openAiCostChf, 2)}
              hint={sourceLabel(k.openAi.source)}
            />
            <Stat label="Nummern" value={String(k.totalNumbers)} />
            <Stat label="Frei" value={String(k.unusedNumbers)} />
          </KpiSection>
        </>
      ) : null}
    </div>
  );
}

function KpiSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-h3 text-navy">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-stroke bg-surface px-4 py-3">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 text-h3 font-semibold text-navy">{value}</p>
      {hint && <p className="mt-0.5 text-caption text-text-muted">{hint}</p>}
    </div>
  );
}
