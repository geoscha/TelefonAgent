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
    await admin
      .from("profiles")
      .update({
        token_balance: ledgerBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    return ledgerBalance;
  }

  return current;
}

/** Grant welcome bonus and reconcile balance before billing checks. */
export async function prepareTokenBalanceForBilling(
  userId: string
): Promise<number> {
  await grantWelcomeTokensIfNeeded(userId);
  return repairTokenBalanceFromLedger(userId);
}

interface TokenMutationResult {
  ok: boolean;
  balance: number;
  duplicate?: boolean;
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

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      token_balance: newBalance,
      last_token_topup_at: now,
      updated_at: now,
    })
    .eq("id", userId);

  if (updateError) {
    await admin
      .from("token_transactions")
      .delete()
      .eq("user_id", userId)
      .eq("source", source)
      .eq("reference_id", referenceId);
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

  let profile: { token_balance?: number } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await admin
      .from("profiles")
      .select("token_balance")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "42703") {
        // token_balance column not migrated yet
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
      // token_transactions table not migrated yet
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

  await creditTokens(
    userId,
    WELCOME_TOKEN_BONUS,
    "welcome_bonus",
    `welcome:${userId}`
  );
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
  const row = await loadProfileTokenRow(userId);
  const current = row?.token_balance ?? 0;

  if (current < amount) {
    return { ok: false, balance: current };
  }

  const newBalance = current - amount;

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
        balance: fresh?.token_balance ?? current,
        duplicate: true,
      };
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ token_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .gte("token_balance", amount)
    .select("token_balance")
    .maybeSingle();

  if (updateError || !updated) {
    return { ok: false, balance: current };
  }

  try {
    await insertTransaction(
      userId,
      -amount,
      updated.token_balance,
      source,
      referenceId,
      metadata
    );
  } catch (err) {
    await admin
      .from("profiles")
      .update({
        token_balance: current,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    console.error("[tokens] debit ledger insert failed:", err);
    return { ok: false, balance: current };
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
