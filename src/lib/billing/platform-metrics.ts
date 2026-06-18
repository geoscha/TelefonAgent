import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getPlatformTokensSpent(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_metrics")
    .select("total_tokens_spent")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    console.error("[platform-metrics] load:", error.message);
    return 0;
  }

  return Number(data?.total_tokens_spent ?? 0);
}

export async function incrementPlatformTokensSpent(amount: number): Promise<void> {
  if (amount <= 0) return;

  const admin = createAdminClient();
  const { error } = await admin.rpc("increment_platform_tokens_spent", {
    p_amount: amount,
  });

  if (error) {
    console.error("[platform-metrics] increment rpc:", error.message);
    await incrementPlatformTokensSpentFallback(amount);
  }
}

async function incrementPlatformTokensSpentFallback(amount: number): Promise<void> {
  const admin = createAdminClient();
  const current = await getPlatformTokensSpent();
  const { error } = await admin
    .from("platform_metrics")
    .upsert({
      id: "global",
      total_tokens_spent: current + amount,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("[platform-metrics] increment fallback:", error.message);
  }
}
