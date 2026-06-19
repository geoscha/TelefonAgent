import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?from=USD&to=CHF";

/** Refresh at most every 12 hours unless forced. */
const RATE_TTL_MS = 12 * 60 * 60 * 1000;

export const USD_CHF_FALLBACK_RATE = 0.88;

export interface UsdChfRateInfo {
  rate: number;
  updatedAt: string | null;
  source: "live" | "cached" | "fallback";
}

export async function fetchLiveUsdToChfRate(): Promise<number> {
  const res = await fetch(FRANKFURTER_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`Wechselkurs-API antwortete mit ${res.status}.`);
  }

  const data = (await res.json()) as { rates?: { CHF?: number } };
  const rate = Number(data.rates?.CHF);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Ungültiger USD/CHF-Kurs von der API.");
  }

  return Math.round(rate * 1_000_000) / 1_000_000;
}

async function persistUsdToChfRate(rate: number): Promise<string> {
  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();

  const { error } = await admin
    .from("admin_config")
    .update({
      usd_to_chf_rate: rate,
      usd_to_chf_updated_at: updatedAt,
      updated_at: updatedAt,
    })
    .eq("id", 1);

  if (error) throw error;
  return updatedAt;
}

function isRateStale(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  return !Number.isFinite(age) || age > RATE_TTL_MS;
}

/**
 * Returns the current USD→CHF rate, refreshing from ECB data when stale.
 */
export async function getUsdToChfRate(options?: {
  forceRefresh?: boolean;
}): Promise<UsdChfRateInfo> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("usd_to_chf_rate, usd_to_chf_updated_at")
    .eq("id", 1)
    .maybeSingle();

  const storedRate = Number(data?.usd_to_chf_rate);
  const updatedAt = (data?.usd_to_chf_updated_at as string | null) ?? null;
  const hasStoredRate = Number.isFinite(storedRate) && storedRate > 0;
  const stale = isRateStale(updatedAt);

  if (!options?.forceRefresh && hasStoredRate && !stale) {
    return { rate: storedRate, updatedAt, source: "cached" };
  }

  try {
    const liveRate = await fetchLiveUsdToChfRate();
    const savedAt = await persistUsdToChfRate(liveRate);
    return { rate: liveRate, updatedAt: savedAt, source: "live" };
  } catch (error) {
    console.warn("[usd-chf-rate] refresh failed:", error);
    if (hasStoredRate) {
      return { rate: storedRate, updatedAt, source: "cached" };
    }
    return {
      rate: USD_CHF_FALLBACK_RATE,
      updatedAt: null,
      source: "fallback",
    };
  }
}
