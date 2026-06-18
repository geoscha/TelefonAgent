/**
 * Diagnose token debit failures. Usage: node scripts/debug-token-debit.mjs [userId]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testUserId = process.argv[2];

async function main() {
  console.log("=== Token debit diagnostics ===\n");

  // 1. Check token_transactions table
  const { error: tableErr } = await admin.from("token_transactions").select("id").limit(1);
  console.log("token_transactions table:", tableErr ? `MISSING/ERROR: ${tableErr.code} ${tableErr.message}` : "OK");

  // 2. Check RPC exists
  const dummyId = "00000000-0000-0000-0000-000000000001";
  const { data: rpcData, error: rpcErr } = await admin.rpc("debit_user_tokens", {
    p_user_id: dummyId,
    p_amount: 0,
    p_source: "debug",
    p_reference_id: null,
    p_metadata: {},
  });
  if (rpcErr) {
    console.log("debit_user_tokens RPC:", `ERROR: ${rpcErr.code} ${rpcErr.message}`);
  } else {
    console.log("debit_user_tokens RPC:", "OK", JSON.stringify(rpcData));
  }

  // 3. Find a user with balance
  let userId = testUserId;
  if (!userId) {
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id, token_balance, email")
      .gt("token_balance", 0)
      .order("token_balance", { ascending: false })
      .limit(3);
    if (profErr) {
      console.log("\nprofiles query error:", profErr.message);
    } else {
      console.log("\nProfiles with balance:", profiles?.length ?? 0);
      for (const p of profiles ?? []) {
        console.log(`  - ${p.id} balance=${p.token_balance} email=${p.email ?? "?"}`);
      }
      userId = profiles?.[0]?.id;
    }
  }

  if (!userId) {
    console.log("\nNo user to test debit. Pass userId as argument.");
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("token_balance")
    .eq("id", userId)
    .maybeSingle();
  console.log(`\nTest user ${userId} balance:`, profile?.token_balance ?? "NOT FOUND");

  const ref = `debug:test:${Date.now()}`;
  const amount = 1;

  // 4. Test RPC debit
  console.log(`\n--- RPC debit ${amount} token (ref ${ref}) ---`);
  const { data: debitData, error: debitErr } = await admin.rpc("debit_user_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_source: "debug",
    p_reference_id: ref,
    p_metadata: { test: true },
  });
  if (debitErr) {
    console.log("RPC debit FAILED:", debitErr.code, debitErr.message);
  } else {
    console.log("RPC debit response:", JSON.stringify(debitData));
  }

  const { data: afterRpc } = await admin
    .from("profiles")
    .select("token_balance")
    .eq("id", userId)
    .maybeSingle();
  console.log("Balance after RPC:", afterRpc?.token_balance);

  // 5. Test direct profile update (fallback path)
  const ref2 = `debug:fallback:${Date.now()}`;
  const current = afterRpc?.token_balance ?? 0;
  if (current >= amount) {
    console.log(`\n--- Direct admin fallback debit ${amount} ---`);
    const newBal = current - amount;
    const { data: updated, error: updErr } = await admin
      .from("profiles")
      .update({ token_balance: newBal })
      .eq("id", userId)
      .eq("token_balance", current)
      .select("token_balance")
      .maybeSingle();

    if (updErr || !updated) {
      console.log("Profile update FAILED:", updErr?.message ?? "no rows matched");
    } else {
      console.log("Profile update OK, balance:", updated.token_balance);
      const { error: insErr } = await admin.from("token_transactions").insert({
        user_id: userId,
        amount: -amount,
        balance_after: newBal,
        source: "debug",
        reference_id: ref2,
        metadata: { test: true },
      });
      if (insErr) {
        console.log("Ledger insert FAILED:", insErr.code, insErr.message);
        await admin.from("profiles").update({ token_balance: current }).eq("id", userId);
      } else {
        console.log("Ledger insert OK");
      }
    }
  }

  const { data: final } = await admin
    .from("profiles")
    .select("token_balance")
    .eq("id", userId)
    .maybeSingle();
  console.log("\nFinal balance:", final?.token_balance);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
