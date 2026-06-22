import "server-only";

import type { InfrastructureCostConfig } from "@/lib/admin/finance-vendor-types";

export interface FinanceConfig {
  /** Monthly cost per phone number in the pool (Twilio + ElevenLabs DID). */
  numberMonthlyChf: number;
  /** Estimated ElevenLabs conversational AI cost per call minute. */
  elevenLabsPerMinuteChf: number;
  /** Optional fixed monthly ElevenLabs platform fee (workspace minimum). */
  elevenLabsPlatformMonthlyChf: number;
  infrastructure: InfrastructureCostConfig;
}

export function getFinanceConfig(): FinanceConfig {
  return {
    numberMonthlyChf: parseEnvChf("FINANCE_NUMBER_MONTHLY_CHF", 1.1),
    elevenLabsPerMinuteChf: parseEnvChf("FINANCE_ELEVENLABS_PER_MINUTE_CHF", 0.15),
    elevenLabsPlatformMonthlyChf: parseEnvChf(
      "FINANCE_ELEVENLABS_PLATFORM_MONTHLY_CHF",
      0
    ),
    infrastructure: {
      vercelMonthlyChf: parseEnvChf("FINANCE_VERCEL_MONTHLY_CHF", 0),
      supabaseMonthlyChf: parseEnvChf("FINANCE_SUPABASE_MONTHLY_CHF", 0),
      azureMonthlyChf: parseEnvChf("FINANCE_AZURE_MONTHLY_CHF", 0),
      gcpMonthlyChf: parseEnvChf("FINANCE_GCP_MONTHLY_CHF", 0),
      cloudflareMonthlyChf: parseEnvChf("FINANCE_CLOUDFLARE_MONTHLY_CHF", 0),
      otherMonthlyChf: parseEnvChf("FINANCE_OTHER_INFRA_MONTHLY_CHF", 0),
    },
  };
}

function parseEnvChf(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
