import "server-only";

import { restoreAgentAfterUpgrade } from "@/lib/elevenlabs/quota-agent";
import type { BillingInterval, Profile } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Activates Pro for a user, resets monthly quota, and restores their agent. */
export async function upgradeUserToPro(
  userId: string,
  billingInterval: BillingInterval = "monthly"
): Promise<void> {
  const admin = createAdminClient();
  const now = monthStart();

  await admin
    .from("profiles")
    .update({
      plan: "pro",
      billing_interval: billingInterval,
      call_seconds_used: 0,
      call_usage_period_start: now.toISOString(),
    })
    .eq("id", userId);

  try {
    await restoreAgentAfterUpgrade(userId);
  } catch (err) {
    console.error("[billing/upgrade] agent restore failed:", err);
  }
}

export async function getProfileForUser(userId: string): Promise<Profile> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("name, email, plan, billing_interval")
    .eq("id", userId)
    .maybeSingle();

  return {
    name: data?.name ?? "",
    email: data?.email ?? "",
    plan: data?.plan === "pro" ? "pro" : "free",
    billingInterval: data?.billing_interval ?? undefined,
  };
}
