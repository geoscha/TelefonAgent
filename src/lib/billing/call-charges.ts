import "server-only";

import { calculateCallTokenCost } from "@/lib/billing/quota-display";
import { chargeCallTokens } from "@/lib/billing/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Call } from "@/lib/types";

export function callTokenReferenceId(callId: string): string {
  return `call:${callId}`;
}

export async function isCallTokenCharged(
  userId: string,
  callId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("token_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "call")
    .eq("reference_id", callTokenReferenceId(callId))
    .maybeSingle();

  return Boolean(data);
}

/** Charges any stored calls that have no matching ledger entry yet. */
export async function reconcileCallTokenCharges(
  userId: string,
  calls: Call[]
): Promise<number> {
  let charged = 0;

  for (const call of calls) {
    if (call.id.startsWith("call-")) continue;

    const cost = calculateCallTokenCost(call.durationSeconds);
    if (cost <= 0) continue;
    if (await isCallTokenCharged(userId, call.id)) continue;

    const result = await chargeCallTokens(userId, call.id, call.durationSeconds);
    if (result.ok || result.duplicate) {
      charged += 1;
    } else {
      console.error("[call-charges] reconcile failed:", {
        callId: call.id,
        cost,
        error: result.error,
        balance: result.balance,
      });
    }
  }

  return charged;
}

export type CallTokenChargeStatus =
  | "skipped"
  | "charged_now"
  | "already_charged"
  | "failed";

export async function ensureCallTokenCharge(
  userId: string,
  call: Pick<Call, "id" | "durationSeconds">
): Promise<{
  cost: number;
  status: CallTokenChargeStatus;
}> {
  const cost = calculateCallTokenCost(call.durationSeconds);
  if (call.id.startsWith("call-") || cost <= 0) {
    return { cost, status: "skipped" };
  }

  if (await isCallTokenCharged(userId, call.id)) {
    return { cost, status: "already_charged" };
  }

  const result = await chargeCallTokens(userId, call.id, call.durationSeconds);
  if (result.ok && !result.duplicate) {
    return { cost, status: "charged_now" };
  }
  if (result.ok || result.duplicate) {
    return { cost, status: "already_charged" };
  }

  console.error("[call-charges] charge failed:", {
    callId: call.id,
    cost,
    error: result.error,
    balance: result.balance,
  });
  return { cost, status: "failed" };
}
