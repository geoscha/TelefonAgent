import "server-only";

import {
  debitTokens,
  creditTokens,
  PHONE_NUMBER_COST_TOKENS,
  prepareTokenBalanceForBilling,
  formatInsufficientTokensMessage,
  formatDebitFailedMessage,
  formatBillingNotConfiguredMessage,
  getTokenBalanceAmount,
} from "@/lib/billing/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export function addOneMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

function subtractOneMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() - 1);
  return d;
}

const MS_PER_DAY = 86_400_000;

function ceilDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

/** Pro-rata refund for unused days in the current billing period. */
export function calculatePhoneRemovalRefund(
  assignedAt: string | undefined,
  nextBillingAt: string | undefined,
  now: Date = new Date()
): number {
  if (PHONE_NUMBER_COST_TOKENS <= 0 || !assignedAt) return 0;

  const periodEnd = nextBillingAt
    ? new Date(nextBillingAt)
    : addOneMonth(new Date(assignedAt));
  const periodStart = nextBillingAt
    ? subtractOneMonth(periodEnd)
    : new Date(assignedAt);

  if (now.getTime() >= periodEnd.getTime()) return 0;

  const monthLengthDays = Math.max(1, ceilDaysBetween(periodStart, periodEnd));
  const holdDays = Math.min(monthLengthDays, ceilDaysBetween(periodStart, now));
  const remainingDays = Math.max(0, monthLengthDays - holdDays);

  return Math.floor((PHONE_NUMBER_COST_TOKENS * remainingDays) / monthLengthDays);
}

export function phoneRefundReferenceId(phoneId: string): string {
  return `phone_refund:${phoneId}`;
}

/** Credits unused monthly phone fees when a number is removed. */
export async function refundPhoneNumberOnRemoval(
  userId: string,
  phone: { id: string; assignedAt?: string; nextBillingAt?: string }
): Promise<number> {
  const amount = calculatePhoneRemovalRefund(phone.assignedAt, phone.nextBillingAt);
  if (amount <= 0) return 0;

  const result = await creditTokens(
    userId,
    amount,
    "phone_refund",
    phoneRefundReferenceId(phone.id),
    {
      phoneId: phone.id,
      assignedAt: phone.assignedAt,
      nextBillingAt: phone.nextBillingAt,
    }
  );

  if (!result.ok && !result.duplicate) {
    console.error("[phone-billing] refund failed:", result.error, { userId, phoneId: phone.id });
    return 0;
  }

  return amount;
}

/** Stable idempotency key for a one-time phone purchase. */
export function phonePurchaseReferenceId(phoneId: string): string {
  return `phone_purchase:${phoneId}`;
}

/** Stable idempotency key (no colons in timestamp). */
export function billingReferenceId(phoneId: string, periodEnd: string): string {
  const ts = new Date(periodEnd).getTime();
  return `phone_monthly:${phoneId}:${ts}`;
}

/** Charges the purchase fee and assigns the phone number. */
export async function setupPhoneBilling(
  userId: string,
  phoneId: string,
  assignedAt: Date = new Date()
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const assignedIso = assignedAt.toISOString();

  if (PHONE_NUMBER_COST_TOKENS <= 0) {
    await admin
      .from("user_phone_numbers")
      .update({
        assigned_at: assignedIso,
        next_billing_at: null,
        updated_at: assignedIso,
      })
      .eq("id", phoneId)
      .eq("user_id", userId);

    return { ok: true, balance: await getTokenBalanceAmount(userId) };
  }

  await prepareTokenBalanceForBilling(userId);

  const referenceId = phonePurchaseReferenceId(phoneId);

  const { data: priorCharge } = await admin
    .from("token_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "phone_purchase")
    .eq("reference_id", referenceId)
    .maybeSingle();

  if (priorCharge) {
    const nextBilling = addOneMonth(assignedAt).toISOString();
    await admin
      .from("user_phone_numbers")
      .update({
        assigned_at: assignedIso,
        next_billing_at: nextBilling,
        updated_at: assignedIso,
      })
      .eq("id", phoneId)
      .eq("user_id", userId);

    return { ok: true, balance: await getTokenBalanceAmount(userId) };
  }

  const balance = await getTokenBalanceAmount(userId);
  if (balance < PHONE_NUMBER_COST_TOKENS) {
    return {
      ok: false,
      error: formatInsufficientTokensMessage(balance, PHONE_NUMBER_COST_TOKENS),
    };
  }

  const result = await debitTokens(
    userId,
    PHONE_NUMBER_COST_TOKENS,
    "phone_purchase",
    referenceId,
    { phoneId, period: "purchase" }
  );

  if (result.error === "rpc_missing" || result.error === "profile_update_blocked") {
    return { ok: false, error: formatBillingNotConfiguredMessage() };
  }

  if (!result.ok && !result.duplicate) {
    const after = await getTokenBalanceAmount(userId);
    if (result.error === "insufficient" || after < PHONE_NUMBER_COST_TOKENS) {
      return {
        ok: false,
        error: formatInsufficientTokensMessage(after, PHONE_NUMBER_COST_TOKENS),
      };
    }
    console.error("[phone-billing] debit failed:", result.error, { userId, phoneId, referenceId });
    return { ok: false, error: formatDebitFailedMessage(after) };
  }

  await admin
    .from("user_phone_numbers")
    .update({
      assigned_at: assignedIso,
      next_billing_at: addOneMonth(assignedAt).toISOString(),
      updated_at: assignedIso,
    })
    .eq("id", phoneId)
    .eq("user_id", userId);

  return { ok: true, balance: result.balance };
}

async function chargePhonePeriod(
  userId: string,
  phoneId: string,
  periodEnd: string
): Promise<boolean> {
  const result = await debitTokens(
    userId,
    PHONE_NUMBER_COST_TOKENS,
    "phone_monthly",
    billingReferenceId(phoneId, periodEnd),
    { phoneId, periodEnd }
  );
  return result.ok || Boolean(result.duplicate);
}

/** Charges overdue monthly phone fees and advances billing periods. */
export async function processDuePhoneBilling(userId: string): Promise<void> {
  if (PHONE_NUMBER_COST_TOKENS <= 0) return;

  const admin = createAdminClient();
  const nowMs = Date.now();

  const { data: phones } = await admin
    .from("user_phone_numbers")
    .select("id, next_billing_at")
    .eq("user_id", userId)
    .not("next_billing_at", "is", null)
    .order("next_billing_at", { ascending: true });

  for (const row of phones ?? []) {
    const phoneId = row.id as string;
    let periodEnd = row.next_billing_at as string;
    const referenceId = billingReferenceId(phoneId, periodEnd);

    const { data: billed } = await admin
      .from("token_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "phone_monthly")
      .eq("reference_id", referenceId)
      .maybeSingle();

    if (!billed) {
      await admin
        .from("user_phone_numbers")
        .update({
          assigned_at: null,
          next_billing_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", phoneId)
        .eq("user_id", userId);
      continue;
    }

    while (periodEnd && new Date(periodEnd).getTime() <= nowMs) {
      const paid = await chargePhonePeriod(userId, phoneId, periodEnd);
      if (!paid) break;

      periodEnd = addOneMonth(new Date(periodEnd)).toISOString();
      await admin
        .from("user_phone_numbers")
        .update({
          next_billing_at: periodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("id", phoneId)
        .eq("user_id", userId);
    }
  }
}
