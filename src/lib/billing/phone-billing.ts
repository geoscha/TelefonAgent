import "server-only";

import {
  debitTokens,
  canAffordTokens,
  PHONE_NUMBER_COST_TOKENS,
  prepareTokenBalanceForBilling,
  formatInsufficientTokensMessage,
  formatDebitFailedMessage,
  formatBillingNotConfiguredMessage,
  loadProfileTokenRow,
} from "@/lib/billing/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export function addOneMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

function billingReferenceId(phoneId: string, periodEnd: string): string {
  return `phone_monthly:${phoneId}:${periodEnd}`;
}

/** Charges the first month and sets billing dates on a new phone number. */
export async function setupPhoneBilling(
  userId: string,
  phoneId: string,
  assignedAt: Date = new Date()
): Promise<{ ok: true } | { ok: false; error: string }> {
  await prepareTokenBalanceForBilling(userId);

  const admin = createAdminClient();
  const { data: priorCharge } = await admin
    .from("token_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "phone_monthly")
    .like("reference_id", `phone_monthly:${phoneId}:%`)
    .limit(1)
    .maybeSingle();

  const assignedIso = assignedAt.toISOString();
  const nextBilling = addOneMonth(assignedAt).toISOString();

  if (priorCharge) {
    await admin
      .from("user_phone_numbers")
      .update({
        assigned_at: assignedIso,
        next_billing_at: nextBilling,
        updated_at: assignedIso,
      })
      .eq("id", phoneId)
      .eq("user_id", userId);
    return { ok: true };
  }

  const affordable = await canAffordTokens(userId, PHONE_NUMBER_COST_TOKENS);
  if (!affordable) {
    const balance = await prepareTokenBalanceForBilling(userId);
    return {
      ok: false,
      error: formatInsufficientTokensMessage(balance, PHONE_NUMBER_COST_TOKENS),
    };
  }

  const result = await debitTokens(
    userId,
    PHONE_NUMBER_COST_TOKENS,
    "phone_monthly",
    billingReferenceId(phoneId, nextBilling),
    { phoneId, period: "initial", nextBillingAt: nextBilling }
  );

  if (!result.ok) {
    const row = await loadProfileTokenRow(userId);
    const balance = row?.token_balance ?? 0;
    const reason = result.reason ?? "";
    if (reason.includes("42P01") || reason === "ledger_insert_failed") {
      return { ok: false, error: formatBillingNotConfiguredMessage() };
    }
    return {
      ok: false,
      error:
        balance >= PHONE_NUMBER_COST_TOKENS
          ? formatDebitFailedMessage(balance)
          : formatInsufficientTokensMessage(balance, PHONE_NUMBER_COST_TOKENS),
    };
  }

  await admin
    .from("user_phone_numbers")
    .update({
      assigned_at: assignedIso,
      next_billing_at: nextBilling,
      updated_at: assignedIso,
    })
    .eq("id", phoneId)
    .eq("user_id", userId);

  return { ok: true };
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

    const { data: billed } = await admin
      .from("token_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "phone_monthly")
      .like("reference_id", `phone_monthly:${phoneId}:%`)
      .limit(1)
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
