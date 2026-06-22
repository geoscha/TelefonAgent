import "server-only";

import type {
  FinanceVendorCategory,
  FinanceVendorEntry,
  InfrastructureCostConfig,
} from "@/lib/admin/finance-vendor-types";

export type {
  FinanceVendorCategory,
  FinanceVendorDataSource,
  FinanceVendorEntry,
  InfrastructureCostConfig,
} from "@/lib/admin/finance-vendor-types";

interface VendorProviderStatus {
  amountChf: number;
  source: "api" | "estimate" | "unconfigured";
  error?: string;
}

interface VendorProviderBalance {
  twilioBalanceChf?: number;
  twilioBalanceUsd?: number;
  elevenLabsCreditsRemaining?: number;
  elevenLabsCreditsLimit?: number;
  elevenLabsTier?: string;
  openAiSpendChf?: number;
}

const CATEGORY_LABELS: Record<FinanceVendorCategory, string> = {
  telephony: "Telefonie & SMS",
  ai: "KI & Sprache",
  infrastructure: "Cloud & Infrastruktur",
  payments: "Zahlungen",
};

function share(amount: number, total: number): number {
  if (total <= 0) return 0;
  return (amount / total) * 100;
}

function chfBalance(value?: number): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return `CHF ${value.toLocaleString("de-CH", { maximumFractionDigits: 2 })}`;
}

export function buildFinanceVendorLedger(input: {
  twilio: VendorProviderStatus;
  elevenLabs: VendorProviderStatus;
  openAi: VendorProviderStatus;
  stripe: VendorProviderStatus;
  balances: VendorProviderBalance;
  integrations: {
    twilioConfigured: boolean;
    elevenLabsConfigured: boolean;
    stripeConfigured: boolean;
    openAiConfigured: boolean;
  };
  infrastructure: InfrastructureCostConfig;
  envSignals: {
    supabaseConfigured: boolean;
    vercelConfigured: boolean;
  };
}): FinanceVendorEntry[] {
  const infraEntries: FinanceVendorEntry[] = [
    {
      id: "vercel",
      name: "Hosting & Deployment",
      provider: "Vercel",
      category: "infrastructure",
      categoryLabel: CATEGORY_LABELS.infrastructure,
      monthlyCostChf: input.infrastructure.vercelMonthlyChf,
      dataSource:
        input.infrastructure.vercelMonthlyChf > 0 ? "manual" : "unconfigured",
      configured:
        input.infrastructure.vercelMonthlyChf > 0 ||
        input.envSignals.vercelConfigured,
      sharePct: 0,
      billingHint: "Fix / Monat",
      settingsHint:
        input.infrastructure.vercelMonthlyChf <= 0
          ? "FINANCE_VERCEL_MONTHLY_CHF in Vercel setzen"
          : undefined,
    },
    {
      id: "supabase",
      name: "Datenbank & Auth",
      provider: "Supabase",
      category: "infrastructure",
      categoryLabel: CATEGORY_LABELS.infrastructure,
      monthlyCostChf: input.infrastructure.supabaseMonthlyChf,
      dataSource:
        input.infrastructure.supabaseMonthlyChf > 0 ? "manual" : "unconfigured",
      configured:
        input.infrastructure.supabaseMonthlyChf > 0 ||
        input.envSignals.supabaseConfigured,
      sharePct: 0,
      billingHint: "Fix / Monat",
      settingsHint:
        input.infrastructure.supabaseMonthlyChf <= 0
          ? "FINANCE_SUPABASE_MONTHLY_CHF in Vercel setzen"
          : undefined,
    },
    {
      id: "azure",
      name: "Cloud Platform",
      provider: "Microsoft Azure",
      category: "infrastructure",
      categoryLabel: CATEGORY_LABELS.infrastructure,
      monthlyCostChf: input.infrastructure.azureMonthlyChf,
      dataSource:
        input.infrastructure.azureMonthlyChf > 0 ? "manual" : "unconfigured",
      configured: input.infrastructure.azureMonthlyChf > 0,
      sharePct: 0,
      billingHint: "Fix / Monat",
      settingsHint:
        input.infrastructure.azureMonthlyChf <= 0
          ? "FINANCE_AZURE_MONTHLY_CHF in Vercel setzen"
          : undefined,
    },
    {
      id: "gcp",
      name: "Cloud Platform",
      provider: "Google Cloud",
      category: "infrastructure",
      categoryLabel: CATEGORY_LABELS.infrastructure,
      monthlyCostChf: input.infrastructure.gcpMonthlyChf,
      dataSource:
        input.infrastructure.gcpMonthlyChf > 0 ? "manual" : "unconfigured",
      configured: input.infrastructure.gcpMonthlyChf > 0,
      sharePct: 0,
      billingHint: "Fix / Monat",
      settingsHint:
        input.infrastructure.gcpMonthlyChf <= 0
          ? "FINANCE_GCP_MONTHLY_CHF in Vercel setzen"
          : undefined,
    },
    {
      id: "cloudflare",
      name: "CDN & DNS",
      provider: "Cloudflare",
      category: "infrastructure",
      categoryLabel: CATEGORY_LABELS.infrastructure,
      monthlyCostChf: input.infrastructure.cloudflareMonthlyChf,
      dataSource:
        input.infrastructure.cloudflareMonthlyChf > 0 ? "manual" : "unconfigured",
      configured: input.infrastructure.cloudflareMonthlyChf > 0,
      sharePct: 0,
      billingHint: "Fix / Monat",
      settingsHint:
        input.infrastructure.cloudflareMonthlyChf <= 0
          ? "FINANCE_CLOUDFLARE_MONTHLY_CHF in Vercel setzen"
          : undefined,
    },
  ];

  if (input.infrastructure.otherMonthlyChf > 0) {
    infraEntries.push({
      id: "other-infra",
      name: "Sonstige Infrastruktur",
      provider: "Diverse",
      category: "infrastructure",
      categoryLabel: CATEGORY_LABELS.infrastructure,
      monthlyCostChf: input.infrastructure.otherMonthlyChf,
      dataSource: "manual",
      configured: true,
      sharePct: 0,
      billingHint: "Fix / Monat",
      settingsHint: "FINANCE_OTHER_INFRA_MONTHLY_CHF",
    });
  }

  const entries: FinanceVendorEntry[] = [
    {
      id: "twilio",
      name: "Telefonie & SMS",
      provider: "Twilio",
      category: "telephony",
      categoryLabel: CATEGORY_LABELS.telephony,
      monthlyCostChf: input.twilio.amountChf,
      balanceLabel: "Guthaben",
      balanceValue:
        input.balances.twilioBalanceChf != null
          ? chfBalance(input.balances.twilioBalanceChf)
          : input.balances.twilioBalanceUsd != null
            ? `USD ${input.balances.twilioBalanceUsd.toFixed(2)}`
            : undefined,
      dataSource: input.twilio.source,
      configured: input.integrations.twilioConfigured,
      error: input.twilio.error,
      sharePct: 0,
      billingHint: "Nutzungsbasiert",
      settingsHint: input.integrations.twilioConfigured
        ? undefined
        : "Twilio unter Einstellungen verbinden",
    },
    {
      id: "elevenlabs",
      name: "Sprach-KI",
      provider: "ElevenLabs",
      category: "ai",
      categoryLabel: CATEGORY_LABELS.ai,
      monthlyCostChf: input.elevenLabs.amountChf,
      balanceLabel: "Credits",
      balanceValue:
        input.balances.elevenLabsCreditsRemaining != null
          ? `${input.balances.elevenLabsCreditsRemaining.toLocaleString("de-CH")}${
              input.balances.elevenLabsCreditsLimit
                ? ` / ${input.balances.elevenLabsCreditsLimit.toLocaleString("de-CH")}`
                : ""
            }${input.balances.elevenLabsTier ? ` · ${input.balances.elevenLabsTier}` : ""}`
          : undefined,
      dataSource: input.elevenLabs.source,
      configured: input.integrations.elevenLabsConfigured,
      error: input.elevenLabs.error,
      sharePct: 0,
      billingHint: "Nutzungsbasiert",
      settingsHint: input.integrations.elevenLabsConfigured
        ? undefined
        : "ElevenLabs API-Key hinterlegen",
    },
    {
      id: "openai",
      name: "LLM & Enrichment",
      provider: "OpenAI",
      category: "ai",
      categoryLabel: CATEGORY_LABELS.ai,
      monthlyCostChf: input.openAi.amountChf,
      balanceLabel: "Monats-Spend",
      balanceValue:
        input.balances.openAiSpendChf != null
          ? chfBalance(input.balances.openAiSpendChf)
          : undefined,
      dataSource: input.openAi.source,
      configured: input.integrations.openAiConfigured,
      error: input.openAi.error,
      sharePct: 0,
      billingHint: "Nutzungsbasiert",
      settingsHint: input.integrations.openAiConfigured
        ? undefined
        : "OpenAI unter Enrichment konfigurieren",
    },
    ...infraEntries,
    {
      id: "stripe",
      name: "Zahlungsabwicklung",
      provider: "Stripe",
      category: "payments",
      categoryLabel: CATEGORY_LABELS.payments,
      monthlyCostChf: 0,
      balanceLabel: "MRR (Einnahmen)",
      balanceValue: input.stripe.amountChf
        ? chfBalance(input.stripe.amountChf)
        : undefined,
      dataSource: input.stripe.source,
      configured: input.integrations.stripeConfigured,
      error: input.stripe.error,
      sharePct: 0,
      billingHint: "Transaktionsgebühren separat",
      settingsHint: input.integrations.stripeConfigured
        ? undefined
        : "Stripe unter Einstellungen verbinden",
    },
  ];

  const costTotal = entries
    .filter((entry) => entry.id !== "stripe")
    .reduce((sum, entry) => sum + entry.monthlyCostChf, 0);

  return entries
    .map((entry) => ({
      ...entry,
      sharePct:
        entry.id === "stripe" ? 0 : share(entry.monthlyCostChf, costTotal),
    }))
    .sort((a, b) => {
      if (a.id === "stripe") return 1;
      if (b.id === "stripe") return -1;
      return b.monthlyCostChf - a.monthlyCostChf;
    });
}

export function sumInfrastructureCosts(
  infrastructure: InfrastructureCostConfig
): number {
  return (
    infrastructure.vercelMonthlyChf +
    infrastructure.supabaseMonthlyChf +
    infrastructure.azureMonthlyChf +
    infrastructure.gcpMonthlyChf +
    infrastructure.cloudflareMonthlyChf +
    infrastructure.otherMonthlyChf
  );
}
