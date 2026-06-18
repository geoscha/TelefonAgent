import "server-only";

import type { BillingPlan } from "@/lib/store";
import {
  FREE_CALL_SECONDS_LIMIT,
  PRO_CALL_SECONDS_LIMIT,
} from "@/lib/billing/quota-display";
import { suspendAgentForQuota } from "@/lib/elevenlabs/quota-agent";
import { snapshotCallStatsForUser } from "@/lib/calls/stats";
import { createAdminClient } from "@/lib/supabase/admin";

/** Free tier: 20 seconds total (lifetime). */
export { FREE_CALL_SECONDS_LIMIT, PRO_CALL_SECONDS_LIMIT };

export interface CallQuota {
  plan: BillingPlan;
  usedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
  percentUsed: number;
  exhausted: boolean;
  periodLabel: string;
  resetsAt?: string;
}

interface ProfileQuotaRow {
  plan: string;
  call_seconds_used: number;
  call_usage_period_start: string;
}

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function nextMonthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function limitSecondsForPlan(plan: BillingPlan): number {
  return plan === "pro" ? PRO_CALL_SECONDS_LIMIT : FREE_CALL_SECONDS_LIMIT;
}

export function buildCallQuota(
  plan: BillingPlan,
  usedSeconds: number
): CallQuota {
  const limitSeconds = limitSecondsForPlan(plan);
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);
  const percentUsed =
    limitSeconds > 0
      ? Math.min(100, (usedSeconds / limitSeconds) * 100)
      : 100;

  const now = new Date();
  const periodLabel =
    plan === "pro"
      ? now.toLocaleDateString("de-CH", { month: "long", year: "numeric" })
      : "Gesamt";

  return {
    plan,
    usedSeconds,
    limitSeconds,
    remainingSeconds,
    percentUsed,
    exhausted: usedSeconds >= limitSeconds,
    periodLabel,
    resetsAt:
      plan === "pro" ? nextMonthStart(now).toISOString() : undefined,
  };
}

async function loadQuotaRow(userId: string): Promise<ProfileQuotaRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("plan, call_seconds_used, call_usage_period_start")
    .eq("id", userId)
    .maybeSingle();
  return data as ProfileQuotaRow | null;
}

/** Resets pro monthly usage when a new calendar month starts. */
export async function ensureQuotaPeriod(userId: string): Promise<ProfileQuotaRow | null> {
  const row = await loadQuotaRow(userId);
  if (!row || row.plan !== "pro") return row;

  const currentMonth = monthStart();
  const periodStart = new Date(row.call_usage_period_start);
  if (periodStart >= currentMonth) return row;

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      call_seconds_used: 0,
      call_usage_period_start: currentMonth.toISOString(),
    })
    .eq("id", userId);

  return {
    ...row,
    call_seconds_used: 0,
    call_usage_period_start: currentMonth.toISOString(),
  };
}

export async function getCallQuotaForUser(userId: string): Promise<CallQuota> {
  const row = await ensureQuotaPeriod(userId);
  const plan: BillingPlan = row?.plan === "pro" ? "pro" : "free";
  const usedSeconds = row?.call_seconds_used ?? 0;

  return buildCallQuota(plan, usedSeconds);
}

export async function addCallUsage(
  userId: string,
  seconds: number
): Promise<void> {
  if (seconds <= 0) return;

  const row = await ensureQuotaPeriod(userId);
  if (!row) return;

  const plan: BillingPlan = row.plan === "pro" ? "pro" : "free";
  const limit = limitSecondsForPlan(plan);
  const previousUsed = row.call_seconds_used ?? 0;
  const newUsed = previousUsed + Math.round(seconds);

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ call_seconds_used: newUsed })
    .eq("id", userId);

  if (plan === "free" && previousUsed < limit && newUsed >= limit) {
    try {
      await snapshotCallStatsForUser(userId);
      await suspendAgentForQuota(userId);
    } catch (err) {
      console.error("[quota] agent suspend failed:", err);
    }
  }
}

/** Ensures free users over quota have their ElevenLabs agent removed. */
export async function enforceFreeQuotaIfNeeded(userId: string): Promise<void> {
  const row = await loadQuotaRow(userId);
  if (!row || row.plan === "pro") return;

  const limit = limitSecondsForPlan("free");
  if ((row.call_seconds_used ?? 0) < limit) return;

  try {
    await snapshotCallStatsForUser(userId);
    await suspendAgentForQuota(userId);
  } catch (err) {
    console.error("[quota] enforce suspend failed:", err);
  }
}

export function formatQuotaDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s} Sek.`;
  if (s === 0) return `${m} Min.`;
  return `${m}:${String(s).padStart(2, "0")} Min.`;
}
