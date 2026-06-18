import "server-only";

import type { TokenBalanceView } from "@/lib/billing/quota-display";
import { pauseUserPhones, releaseStalePausedPhones, resumeUserPhones } from "@/lib/billing/phone-pause";
import { createAdminClient } from "@/lib/supabase/admin";

/** Internal accounting — never expose to clients. */
export const TOKENS_PER_CHF = 1000;
export const CHF_PER_USD = 0.8;

export const PHONE_NUMBER_COST_TOKENS = 1800;
export const CALL_SECOND_COST_TOKENS = 10;
export const WELCOME_TOKEN_BONUS = 2000;

export const TOKEN_RELEASE_DAYS = 7;

interface ProfileTokenRow {
  token_balance: number;
  phone_paused_at: string | null;
  last_token_topup_at: string | null;
}

export async function loadProfileTokenRow(
  userId: string
): Promise<ProfileTokenRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("token_balance, phone_paused_at, last_token_topup_at")
    .eq("id", userId)
    .maybeSingle();
  return data as ProfileTokenRow | null;
}

export function buildTokenBalanceView(row: ProfileTokenRow | null): TokenBalanceView {
  const balance = row?.token_balance ?? 0;
  const phonePaused = Boolean(row?.phone_paused_at);
  return {
    balance,
    exhausted: balance <= 0,
    phonePaused,
    phonePausedAt: row?.phone_paused_at ?? undefined,
  };
}

export async function getTokenBalanceForUser(
  userId: string
): Promise<TokenBalanceView> {
  const row = await loadProfileTokenRow(userId);
  return buildTokenBalanceView(row);
}

export async function canAffordTokens(
  userId: string,
  amount: number
): Promise<boolean> {
  if (amount <= 0) return true;
  const row = await loadProfileTokenRow(userId);
  return (row?.token_balance ?? 0) >= amount;
}

/** Sync profile balance from the token ledger when they diverge. */
export async function repairTokenBalanceFromLedger(
  userId: string
): Promise<number> {
  const admin = createAdminClient();
  const row = await loadProfileTokenRow(userId);
  if (!row) return 0;

  const { data: txs, error } = await admin
    .from("token_transactions")
    .select("amount")
    .eq("user_id", userId);

  if (error) {
    if (error.code === "42P01") return row.token_balance ?? 0;
    throw error;
  }

  if (!txs?.length) return row.token_balance ?? 0;

  const ledgerBalance = txs.reduce(
    (sum, tx) => sum + Number(tx.amount ?? 0),
    0
  );
  const current = row.token_balance ?? 0;

  if (ledgerBalance >= 0 && ledgerBalance !== current) {
    // Prefer profile balance when ledger is behind (e.g. default signup grant).
    if (ledgerBalance > current || current === 0) {
      await admin
        .from("profiles")
        .update({
          token_balance: ledgerBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      return ledgerBalance;
    }
  }

  return current;
}

/** Grant welcome bonus and reconcile balance before billing checks. */
export async function prepareTokenBalanceForBilling(
  userId: string
): Promise<number> {
  await grantWelcomeTokensIfNeeded(userId);
  await reverseOrphanPhoneCharges(userId);
  return repairTokenBalanceFromLedger(userId);
}

/** Credit back monthly phone charges for numbers that no longer exist. */
export async function reverseOrphanPhoneCharges(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: charges, error } = await admin
    .from("token_transactions")
    .select("id, amount, reference_id")
    .eq("user_id", userId)
    .eq("source", "phone_monthly");

  if (error) {
    if (error.code === "42P01") return;
    throw error;
  }
  if (!charges?.length) return;

  const { data: phones } = await admin
    .from("user_phone_numbers")
    .select("id")
    .eq("user_id", userId);

  const phoneIds = new Set((phones ?? []).map((p) => p.id as string));

  for (const charge of charges) {
    const ref = charge.reference_id as string | null;
    if (!ref?.startsWith("phone_monthly:")) continue;

    const phoneId = ref.split(":")[1];
    if (!phoneId || phoneIds.has(phoneId)) continue;

    const amount = Math.abs(Number(charge.amount ?? 0));
    if (amount <= 0) continue;

    await creditTokens(
      userId,
      amount,
      "billing_reversal",
      `reversal:${charge.id as string}`,
      { reversedTransactionId: charge.id, reason: "orphan_phone" }
    );
  }
}

export function formatInsufficientTokensMessage(
  balance: number,
  required: number
): string {
  return `Nicht genügend Tokens (vorhanden: ${balance.toLocaleString("de-CH")}, benötigt: ${required.toLocaleString("de-CH")} für den ersten Monat). Bitte laden Sie unter Abrechnung auf.`;
}

export function formatDebitFailedMessage(balance: number): string {
  return `Die Token-Abbuchung ist fehlgeschlagen (Guthaben: ${balance.toLocaleString("de-CH")}). Bitte Seite neu laden und erneut versuchen.`;
}

export function formatBillingNotConfiguredMessage(): string {
  return "Token-Abrechnung ist noch nicht eingerichtet. Bitte kontaktieren Sie den Support.";
}

interface DebitRpcRow {
  success: boolean;
  new_balance: number;
  duplicate_charge: boolean;
}

interface CreditRpcRow {
  success: boolean;
  new_balance: number;
  duplicate_credit: boolean;
}

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42883" ||
    Boolean(error.message?.includes("debit_user_tokens")) ||
    Boolean(error.message?.includes("credit_user_tokens")) ||
    Boolean(error.message?.includes("grant_welcome_tokens"))
  );
}

function firstRpcRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  if (data && typeof data === "object") return data as T;
  return undefined;
}

function parseDebitRpcRow(data: unknown): DebitRpcRow | undefined {
  const row = firstRpcRow<Record<string, unknown>>(data);
  if (!row) return undefined;
  return {
    success: Boolean(row.success),
    new_balance: Number(row.new_balance ?? row.newBalance ?? 0),
    duplicate_charge: Boolean(row.duplicate_charge ?? row.duplicateCharge),
  };
}

function parseCreditRpcRow(data: unknown): CreditRpcRow | undefined {
  const row = firstRpcRow<Record<string, unknown>>(data);
  if (!row) return undefined;
  return {
    success: Boolean(row.success),
    new_balance: Number(row.new_balance ?? row.newBalance ?? 0),
    duplicate_credit: Boolean(row.duplicate_credit ?? row.duplicateCredit),
  };
}

async function creditTokensViaRpc(
  userId: string,
  amount: number,
  source: string,
  referenceId: string,
  metadata?: Record<string, unknown>,
  touchTopup = false
): Promise<TokenMutationResult | "missing" | "retry"> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("credit_user_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_reference_id: referenceId,
    p_metadata: metadata ?? {},
    p_touch_topup: touchTopup,
  });

  if (error) {
    if (isMissingRpcError(error)) return "missing";
    console.error("[tokens] credit_user_tokens rpc failed:", error);
    return "retry";
  }

  const row = parseCreditRpcRow(data);
  if (!row) return "retry";

  return {
    ok: row.success || row.duplicate_credit,
    balance: row.new_balance,
    duplicate: row.duplicate_credit,
  };
}

export async function assertCanAffordPhoneNumber(
  userId: string
): Promise<{ ok: true; balance: number } | { ok: false; balance: number; error: string }> {
  const balance = await prepareTokenBalanceForBilling(userId);
  if (balance >= PHONE_NUMBER_COST_TOKENS) {
    return { ok: true, balance };
  }
  return {
    ok: false,
    balance,
    error: formatInsufficientTokensMessage(balance, PHONE_NUMBER_COST_TOKENS),
  };
}

interface TokenMutationResult {
  ok: boolean;
  balance: number;
  duplicate?: boolean;
  reason?: string;
}

async function debitTokensFallback(
  userId: string,
  amount: number,
  source: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<TokenMutationResult> {
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
      const fresh = await loadProfileTokenRow(userId);
      return {
        ok: true,
        balance: fresh?.token_balance ?? 0,
        duplicate: true,
      };
    }
  }

  const row = await loadProfileTokenRow(userId);
  const current = row?.token_balance ?? 0;
  if (current < amount) {
    return { ok: false, balance: current, reason: "insufficient" };
  }

  const newBalance = current - amount;
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ token_balance: newBalance, updated_at: now })
    .eq("id", userId)
    .eq("token_balance", current)
    .select("token_balance")
    .maybeSingle();

  if (updateError) {
    console.error("[tokens] debit fallback update error:", updateError);
    return { ok: false, balance: current, reason: updateError.message };
  }

  if (!updated) {
    const fresh = await loadProfileTokenRow(userId);
    const latest = fresh?.token_balance ?? current;
    if (latest < amount) {
      return { ok: false, balance: latest, reason: "insufficient_race" };
    }
    console.error("[tokens] debit fallback update matched no rows, balance:", latest);
    return { ok: false, balance: latest, reason: "update_no_rows" };
  }

  try {
    const { duplicate } = await insertTransaction(
      userId,
      -amount,
      updated.token_balance,
      source,
      referenceId,
      metadata
    );
    if (duplicate) {
      await admin
        .from("profiles")
        .update({ token_balance: current, updated_at: now })
        .eq("id", userId);
      const fresh = await loadProfileTokenRow(userId);
      return {
        ok: true,
        balance: fresh?.token_balance ?? current,
        duplicate: true,
      };
    }
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error("[tokens] debit fallback ledger error:", e.code, e.message);
    if (e.code !== "42P01") {
      await admin
        .from("profiles")
        .update({ token_balance: current, updated_at: now })
        .eq("id", userId);
      return {
        ok: false,
        balance: current,
        reason: e.message ?? "ledger_insert_failed",
      };
    }
  }

  if (updated.token_balance <= 0) {
    try {
      await pauseUserPhones(userId);
    } catch (err) {
      console.error("[tokens] pause after debit failed:", err);
    }
  }

  return { ok: true, balance: updated.token_balance };
}

async function insertTransaction(
  userId: string,
  amount: number,
  balanceAfter: number,
  source: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<{ duplicate: boolean }> {
  const admin = createAdminClient();
  const { error } = await admin.from("token_transactions").insert({
    user_id: userId,
    amount,
    balance_after: balanceAfter,
    source,
    reference_id: referenceId ?? null,
    metadata: metadata ?? {},
  });

  if (error?.code === "23505") {
    return { duplicate: true };
  }
  if (error) {
    throw error;
  }
  return { duplicate: false };
}

/** Credits tokens (top-up). Idempotent when referenceId is provided. */
export async function creditTokens(
  userId: string,
  amount: number,
  source: string,
  referenceId: string,
  metadata?: Record<string, unknown>
): Promise<TokenMutationResult> {
  if (amount <= 0) {
    return { ok: false, balance: (await loadProfileTokenRow(userId))?.token_balance ?? 0 };
  }

  const touchTopup = source === "stripe_topup" || source === "admin_topup";
  const rpcResult = await creditTokensViaRpc(
    userId,
    amount,
    source,
    referenceId,
    metadata,
    touchTopup
  );

  if (rpcResult !== "missing" && rpcResult !== "retry") {
    if (rpcResult.ok && !rpcResult.duplicate) {
      const row = await loadProfileTokenRow(userId);
      if (row?.phone_paused_at) {
        try {
          await resumeUserPhones(userId);
        } catch (err) {
          console.error("[tokens] resume after top-up failed:", err);
        }
      }
    }
    return rpcResult;
  }

  const admin = createAdminClient();
  const row = await loadProfileTokenRow(userId);
  const current = row?.token_balance ?? 0;
  const newBalance = current + amount;
  const now = new Date().toISOString();

  const { duplicate } = await insertTransaction(
    userId,
    amount,
    newBalance,
    source,
    referenceId,
    metadata
  );

  if (duplicate) {
    const fresh = await loadProfileTokenRow(userId);
    return { ok: true, balance: fresh?.token_balance ?? current, duplicate: true };
  }

  const updatePayload: Record<string, unknown> = {
    token_balance: newBalance,
    updated_at: now,
  };
  if (touchTopup) {
    updatePayload.last_token_topup_at = now;
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId);

  if (updateError) {
    await admin
      .from("token_transactions")
      .delete()
      .eq("user_id", userId)
      .eq("source", source)
      .eq("reference_id", referenceId);
    console.error("[tokens] credit profile update failed:", updateError);
    return { ok: false, balance: current };
  }

  if (row?.phone_paused_at) {
    try {
      await resumeUserPhones(userId);
    } catch (err) {
      console.error("[tokens] resume after top-up failed:", err);
    }
  }

  return { ok: true, balance: newBalance };
}

/** One-time welcome bonus for new accounts (idempotent). */
export async function grantWelcomeTokensIfNeeded(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: _rpcData, error: rpcError } = await admin.rpc("grant_welcome_tokens", {
    p_user_id: userId,
    p_amount: WELCOME_TOKEN_BONUS,
  });

  if (!rpcError) {
    return;
  }

  if (!isMissingRpcError(rpcError)) {
    console.warn("[tokens] grant_welcome_tokens rpc failed:", rpcError);
  }

  let profile: { token_balance?: number } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await admin
      .from("profiles")
      .select("token_balance")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "42703") {
        return;
      }
      throw error;
    }

    if (data) {
      profile = data;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }

  if (!profile) {
    console.warn("[tokens] welcome grant skipped — profile missing:", userId);
    return;
  }

  const { data: existing, error: txError } = await admin
    .from("token_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "welcome_bonus")
    .limit(1)
    .maybeSingle();

  if (txError) {
    if (txError.code === "42P01") {
      if ((profile.token_balance ?? 0) < WELCOME_TOKEN_BONUS) {
        await admin
          .from("profiles")
          .update({
            token_balance: WELCOME_TOKEN_BONUS,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
      }
      return;
    }
    throw txError;
  }

  if (existing) {
    await repairTokenBalanceFromLedger(userId);
    return;
  }

  const current = profile.token_balance ?? 0;
  if (current >= WELCOME_TOKEN_BONUS) {
    await insertTransaction(
      userId,
      WELCOME_TOKEN_BONUS,
      current,
      "welcome_bonus",
      `welcome:${userId}`
    ).catch((err) => {
      console.warn("[tokens] welcome ledger sync failed:", err);
    });
    return;
  }

  await creditTokens(userId, WELCOME_TOKEN_BONUS, "welcome_bonus", `welcome:${userId}`);
}

/** Debits tokens. Idempotent when referenceId is provided. Returns false if insufficient. */
export async function debitTokens(
  userId: string,
  amount: number,
  source: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<TokenMutationResult> {
  if (amount <= 0) {
    const row = await loadProfileTokenRow(userId);
    return { ok: true, balance: row?.token_balance ?? 0 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("debit_user_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_reference_id: referenceId ?? null,
    p_metadata: metadata ?? {},
  });

  if (!error) {
    const row = parseDebitRpcRow(data);
    if (row) {
      const balance =
        Number.isFinite(row.new_balance) && row.new_balance >= 0
          ? row.new_balance
          : ((await loadProfileTokenRow(userId))?.token_balance ?? 0);

      const ok = row.success || row.duplicate_charge;
      if (ok) {
        if (balance <= 0) {
          try {
            await pauseUserPhones(userId);
          } catch (err) {
            console.error("[tokens] pause after debit failed:", err);
          }
        }
        return { ok: true, balance, duplicate: row.duplicate_charge };
      }

      if (balance < amount) {
        return { ok: false, balance, reason: "insufficient" };
      }

      console.warn("[tokens] debit RPC declined despite balance, trying fallback:", balance);
    }
  } else if (!isMissingRpcError(error)) {
    console.error("[tokens] debit_user_tokens rpc:", error.code, error.message);
  }

  const fallback = await debitTokensFallback(
    userId,
    amount,
    source,
    referenceId,
    metadata
  );
  if (!fallback.ok) {
    console.error("[tokens] debit failed:", fallback.reason, { userId, amount, source, referenceId });
  }
  return fallback;
}

export async function chargeCallTokens(
  userId: string,
  callId: string,
  durationSeconds: number
): Promise<void> {
  if (durationSeconds <= 0) return;

  const row = await loadProfileTokenRow(userId);
  if ((row?.token_balance ?? 0) <= 0 && row?.phone_paused_at) {
    return;
  }

  const cost = Math.round(durationSeconds) * CALL_SECOND_COST_TOKENS;
  const result = await debitTokens(userId, cost, "call", `call:${callId}`, {
    durationSeconds,
    cost,
  });

  if (!result.ok && !result.duplicate) {
    try {
      await pauseUserPhones(userId);
    } catch (err) {
      console.error("[tokens] pause after failed call charge:", err);
    }
  }
}

/** Runs welcome grant, stale release, due phone billing, and pause/resume sync. */
export async function enforceTokenState(userId: string): Promise<void> {
  try {
    await grantWelcomeTokensIfNeeded(userId);
  } catch (err) {
    console.error("[tokens] welcome grant failed:", err);
  }

  try {
    await releaseStalePausedPhones(userId);
  } catch (err) {
    console.error("[tokens] stale release failed:", err);
  }

  try {
    const { processDuePhoneBilling } = await import("@/lib/billing/phone-billing");
    await processDuePhoneBilling(userId);
  } catch (err) {
    console.error("[tokens] phone billing failed:", err);
  }

  const row = await loadProfileTokenRow(userId);
  if (!row) return;

  if (row.token_balance <= 0 && !row.phone_paused_at) {
    try {
      await pauseUserPhones(userId);
    } catch (err) {
      console.error("[tokens] enforce pause failed:", err);
    }
  } else if (row.token_balance > 0 && row.phone_paused_at) {
    try {
      await resumeUserPhones(userId);
    } catch (err) {
      console.error("[tokens] enforce resume failed:", err);
    }
  }
}
