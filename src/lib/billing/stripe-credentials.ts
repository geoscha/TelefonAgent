import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface StripeCredentials {
  secretKey: string | null;
  webhookSecret: string | null;
  secretSource: "env" | "database" | null;
  webhookSource: "env" | "database" | null;
}

export async function resolveStripeCredentials(): Promise<StripeCredentials> {
  const envSecret = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const envWebhook = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("stripe_finance_secret_key, stripe_webhook_secret")
    .eq("id", 1)
    .maybeSingle();

  const dbSecret =
    (data?.stripe_finance_secret_key as string | null)?.trim() || null;
  const dbWebhook =
    (data?.stripe_webhook_secret as string | null)?.trim() || null;

  const secretKey = envSecret || dbSecret;
  const webhookSecret = envWebhook || dbWebhook;

  return {
    secretKey,
    webhookSecret,
    secretSource: secretKey
      ? envSecret
        ? "env"
        : "database"
      : null,
    webhookSource: webhookSecret
      ? envWebhook
        ? "env"
        : "database"
      : null,
  };
}
