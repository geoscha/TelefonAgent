import "server-only";

import {
  calculateCallTokenCost,
  CALL_SECOND_COST_TOKENS,
  type TokenBalanceView,
} from "@/lib/billing/quota-display";

export { CALL_SECOND_COST_TOKENS, calculateCallTokenCost };
import { pauseUserPhones, releaseStalePausedPhones, resumeUserPhones } from "@/lib/billing/phone-pause";
import { createAdminClient } from "@/lib/supabase/admin";

export const TOKENS_PER_CHF = 1000;
export const CHF_PER_USD = 0.8;
export const PHONE_NUMBER_COST_TOKENS = 1800;
export const WELCOME_TOKEN_BONUS = 2000;
export const TOKEN_RELEASE_DAYS = 7;

interface ProfileTokenRow {
  token_balance: number;
  phone_paused_at: string | null;
  last_token_topup_at: string | null;
}

interface RpcTokenResult {
  ok: boolean;
  balance: number;
  duplicate?: boolean;
  error?: string;
}

export async function loadProfileTokenRow(
  userId: string
): Promise<ProfileTokenRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("token_balance, phone_paused_at, last_token_topup_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[tokens] load profile:", error.message);
    return null;
  }
  return data as ProfileTokenRow | null;
}

export function buildTokenBalanceView(row: ProfileTokenRow | null): TokenBalanceView {
  const balance = row?.token_balance ?? 0;
  return {
    balance,
    exhausted: balance <= 0,
    phonePaused: Boolean(row?.phone_paused_at),
    phonePausedAt: row?.phone_paused_at ?? undefined,
  };
}

export async function getTokenBalanceForUser(userId: string): Promise<TokenBalanceView> {
  return buildTokenBalanceView(await loadProfileTokenRow(userId));
}

export async function getTokenBalanceAmount(userId: string): Promise<number> {
  const row = await loadProfileTokenRow(userId);
  return row?.token_balance ?? 0;
}

export function formatInsufficientTokensMessage(balance: number, required: number): string {
  return `Nicht genügend Tokens (vorhanden: ${balance.toLocaleString("de-CH")}, benötigt: ${required.toLocaleString("de-CH")} für die Telefonnummer). Bitte laden Sie unter Abrechnung auf.`;
}

export function formatDebitFailedMessage(balance: number): string {
  return `Die Token-Abbuchung ist fehlgeschlagen (Guthaben: ${balance.toLocaleString("de-CH")}). Bitte erneut versuchen.`;
}

export function formatBillingNotConfiguredMessage(): string {
  return "Token-Abrechnung ist nicht eingerichtet. Bitte Migration 0027 in Supabase ausführen.";
}

function parseRpcBool(value: unknown): boolean {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

function parseRpcJson(data: unknown): RpcTokenResult | null {
  if (Array.isArray(data)) {
    return parseRpcJson(data[0]);
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const ok = parseRpcBool(row.ok ?? row.success);
  const balance = Number(row.balance ?? row.new_balance ?? 0);
  return {
    ok,
    balance,
    duplicate: parseRpcBool(row.duplicate ?? row.duplicate_charge ?? row.duplicate_credit),
    error: typeof row.error === "string" ? row.error : undefined,
  };
}

function isRpcMissing(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    Boolean(error.message?.includes("Could not find the function"))
  );
}

async function callDebitRpc(
  userId: string,
  amount: number,
  source: string,
  referenceId: string | null,
  metadata: Record<string, unknown>
): Promise<RpcTokenResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("debit_user_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_reference_id: referenceId,
    p_metadata: metadata,
  });

  if (error) {
    if (isRpcMissing(error)) {
      return { ok: false, balance: await getTokenBalanceAmount(userId), error: "rpc_missing" };
    }
    console.error("[tokens] debit rpc error:", error.code, error.message);
    return { ok: false, balance: await getTokenBalanceAmount(userId), error: error.message };
  }

  const parsed = parseRpcJson(data);
  if (!parsed) {
    return { ok: false, balance: await getTokenBalanceAmount(userId), error: "invalid_rpc_response" };
  }
  if (!parsed.ok && parsed.error) {
    console.error("[tokens] debit rpc declined:", parsed.error, { userId, amount, source, referenceId });
  }
  return parsed;
}

/** Service-role path when RPC unavailable or failed (bypasses RLS on ledger). */
async function debitViaAdminClient(
  userId: string,
  amount: number,
  source: string,
  referenceId: string | null,
  metadata: Record<string, unknown>
): Promise<RpcTokenResult> {
  const admin = createAdminClient();

  if (referenceId) {
    const { data: existingTx } = await admin
      .from("token_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source", source)
      .eq("reference_id", referenceId)
      .maybeSingle();

    if (existingTx) {
      return { ok: true, balance: await getTokenBalanceAmount(userId), duplicate: true };
    }
  }

  const current = await getTokenBalanceAmount(userId);
  if (current < amount) {
    return { ok: false, balance: current, error: "insufficient" };
  }

  const newBalance = current - amount;

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ token_balance: newBalance })
    .eq("id", userId)
    .eq("token_balance", current)
    .select("token_balance")
    .maybeSingle();

  if (updateError || !updated) {
    console.error("[tokens] admin debit profile failed:", updateError?.message ?? "no rows");
    return { ok: false, balance: current, error: updateError?.message ?? "profile_update_failed" };
  }

  const appliedBalance = Number(updated.token_balance);
  if (appliedBalance !== newBalance) {
    console.error("[tokens] admin debit profile unchanged:", {
      userId,
      expected: newBalance,
      actual: appliedBalance,
    });
    return {
      ok: false,
      balance: appliedBalance,
      error: "profile_update_blocked",
    };
  }

  const { error: insertError } = await admin.from("token_transactions").insert({
    user_id: userId,
    amount: -amount,
    balance_after: newBalance,
    source,
    reference_id: referenceId,
    metadata: metadata ?? {},
  });

  if (insertError) {
    if (insertError.code === "23505") {
      await admin
        .from("profiles")
        .update({ token_balance: current })
        .eq("id", userId);
      return { ok: true, balance: await getTokenBalanceAmount(userId), duplicate: true };
    }
    console.error("[tokens] admin debit ledger failed:", insertError.code, insertError.message);
    await admin
      .from("profiles")
      .update({ token_balance: current })
      .eq("id", userId);
    return { ok: false, balance: current, error: insertError.message };
  }

  try {
    const { incrementPlatformTokensSpent } = await import("@/lib/billing/platform-metrics");
    await incrementPlatformTokensSpent(amount);
  } catch (err) {
    console.error("[tokens] platform spend increment:", err);
  }

  return { ok: true, balance: newBalance };
}

async function callCreditRpc(
  userId: string,
  amount: number,
  source: string,
  referenceId: string,
  metadata: Record<string, unknown>,
  touchTopup: boolean
): Promise<RpcTokenResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("credit_user_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_reference_id: referenceId,
    p_metadata: metadata,
    p_touch_topup: touchTopup,
  });

  if (error) {
    if (isRpcMissing(error)) {
      return { ok: false, balance: await getTokenBalanceAmount(userId), error: "rpc_missing" };
    }
    console.error("[tokens] credit rpc error:", error.code, error.message);
    return { ok: false, balance: await getTokenBalanceAmount(userId), error: error.message };
  }

  const parsed = parseRpcJson(data);
  if (!parsed) {
    return { ok: false, balance: await getTokenBalanceAmount(userId), error: "invalid_rpc_response" };
  }
  return parsed;
}

/** Ensures welcome bonus exists (idempotent). Never lowers balance. */
export async function grantWelcomeTokensIfNeeded(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("grant_welcome_tokens", {
    p_user_id: userId,
    p_amount: WELCOME_TOKEN_BONUS,
  });

  if (error && isRpcMissing(error)) {
    const row = await loadProfileTokenRow(userId);
    const current = row?.token_balance ?? 0;
    if (current >= WELCOME_TOKEN_BONUS) return;

    await admin
      .from("profiles")
      .update({ token_balance: WELCOME_TOKEN_BONUS })
      .eq("id", userId);
    return;
  }

  if (error) {
    console.warn("[tokens] grant_welcome_tokens:", error.message);
  }
}

export async function prepareTokenBalanceForBilling(userId: string): Promise<number> {
  await grantWelcomeTokensIfNeeded(userId);
  return getTokenBalanceAmount(userId);
}

export async function canAffordTokens(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  return (await getTokenBalanceAmount(userId)) >= amount;
}

export async function assertCanAffordPhoneNumber(
  userId: string
): Promise<{ ok: true; balance: number } | { ok: false; balance: number; error: string }> {
  const balance = await prepareTokenBalanceForBilling(userId);
  if (PHONE_NUMBER_COST_TOKENS <= 0 || balance >= PHONE_NUMBER_COST_TOKENS) {
    return { ok: true, balance };
  }
  return {
    ok: false,
    balance,
    error: formatInsufficientTokensMessage(balance, PHONE_NUMBER_COST_TOKENS),
  };
}

export async function debitTokens(
  userId: string,
  amount: number,
  source: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<RpcTokenResult> {
  if (amount <= 0) {
    return { ok: true, balance: await getTokenBalanceAmount(userId) };
  }

  const rpcResult = await callDebitRpc(
    userId,
    amount,
    source,
    referenceId ?? null,
    metadata ?? {}
  );

  if (rpcResult.ok || rpcResult.duplicate) {
    if (rpcResult.balance <= 0) {
      try {
        await pauseUserPhones(userId);
      } catch (err) {
        console.error("[tokens] pause after debit:", err);
      }
    }
    return rpcResult;
  }

  const balance = await getTokenBalanceAmount(userId);
  if (balance < amount) {
    return { ok: false, balance, error: "insufficient" };
  }

  console.warn(
    "[tokens] debit RPC failed despite sufficient balance, trying admin fallback:",
    rpcResult.error ?? "declined"
  );
  const fallback = await debitViaAdminClient(
    userId,
    amount,
    source,
    referenceId ?? null,
    metadata ?? {}
  );

  if (fallback.ok || fallback.duplicate) {
    if (fallback.balance <= 0) {
      try {
        await pauseUserPhones(userId);
      } catch (err) {
        console.error("[tokens] pause after debit:", err);
      }
    }
    return fallback;
  }

  console.error("[tokens] debit failed:", fallback.error ?? rpcResult.error, {
    userId,
    amount,
    source,
    referenceId,
  });
  return fallback;
}

export async function creditTokens(
  userId: string,
  amount: number,
  source: string,
  referenceId: string,
  metadata?: Record<string, unknown>
): Promise<RpcTokenResult> {
  if (amount <= 0) {
    return { ok: false, balance: await getTokenBalanceAmount(userId) };
  }

  const touchTopup = source === "stripe_topup" || source === "admin_topup";
  const result = await callCreditRpc(
    userId,
    amount,
    source,
    referenceId,
    metadata ?? {},
    touchTopup
  );

  if (result.ok && !result.duplicate) {
    const row = await loadProfileTokenRow(userId);
    if (row?.phone_paused_at && (source === "stripe_topup" || source === "admin_topup" || source === "phone_refund")) {
      try {
        await resumeUserPhones(userId);
      } catch (err) {
        console.error("[tokens] resume after credit:", err);
      }
    }
  }

  return result;
}

export interface CallChargeResult {
  cost: number;
  ok: boolean;
  duplicate: boolean;
  balance: number;
  error?: string;
}

export async function chargeCallTokens(
  userId: string,
  callId: string,
  durationSeconds: number
): Promise<CallChargeResult> {
  const cost = calculateCallTokenCost(durationSeconds);
  if (durationSeconds <= 0 || cost <= 0) {
    return {
      cost: 0,
      ok: true,
      duplicate: false,
      balance: await getTokenBalanceAmount(userId),
    };
  }

  const row = await loadProfileTokenRow(userId);
  if ((row?.token_balance ?? 0) <= 0 && row?.phone_paused_at) {
    return {
      cost,
      ok: false,
      duplicate: false,
      balance: row?.token_balance ?? 0,
    };
  }

  const result = await debitTokens(userId, cost, "call", `call:${callId}`, {
    durationSeconds,
    cost,
  });

  if (!result.ok && !result.duplicate) {
    try {
      await pauseUserPhones(userId);
    } catch (err) {
      console.error("[tokens] pause after call charge:", err);
    }
  }

  return {
    cost,
    ok: result.ok,
    duplicate: Boolean(result.duplicate),
    balance: result.balance,
    error: result.error,
  };
}

export async function enforceTokenState(userId: string): Promise<void> {
  try {
    await grantWelcomeTokensIfNeeded(userId);
  } catch (err) {
    console.error("[tokens] welcome grant:", err);
  }

  try {
    await releaseStalePausedPhones(userId);
  } catch (err) {
    console.error("[tokens] stale release:", err);
  }

  try {
    const { processDuePhoneBilling } = await import("@/lib/billing/phone-billing");
    await processDuePhoneBilling(userId);
  } catch (err) {
    console.error("[tokens] phone billing:", err);
  }

  try {
    const { processPendingPhoneReleases } = await import("@/lib/billing/phone-billing");
    await processPendingPhoneReleases(userId);
  } catch (err) {
    console.error("[tokens] phone release:", err);
  }

  const row = await loadProfileTokenRow(userId);
  if (!row) return;

  if (row.token_balance <= 0 && !row.phone_paused_at) {
    try {
      await pauseUserPhones(userId);
    } catch (err) {
      console.error("[tokens] enforce pause:", err);
    }
  } else if (row.token_balance > 0 && row.phone_paused_at) {
    try {
      await resumeUserPhones(userId);
    } catch (err) {
      console.error("[tokens] enforce resume:", err);
    }
  }
}
