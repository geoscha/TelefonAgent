import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface StripeCredentials {
  secretKey: string | null;
  webhookSecret: string | null;
  secretSource: "env" | "database" | null;
  webhookSource: "env" | "database" | null;
  /** DB column `stripe_webhook_secret` missing — run migration 0036. */
  webhookColumnMissing: boolean;
}

function envStripeSecret(): string | null {
  return (
    process.env.STRIPE_SECRET_KEY?.trim() ||
    process.env.STRIPE_FINANCE_SECRET_KEY?.trim() ||
    null
  );
}

function envStripeWebhook(): string | null {
  return (
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET?.trim() ||
    null
  );
}

export async function readAdminStripeFromDb(): Promise<{
  secretKey: string | null;
  webhookSecret: string | null;
  webhookColumnMissing: boolean;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_config")
    .select("stripe_finance_secret_key, stripe_webhook_secret")
    .eq("id", 1)
    .maybeSingle();

  if (!error) {
    return {
      secretKey:
        (data?.stripe_finance_secret_key as string | null)?.trim() || null,
      webhookSecret:
        (data?.stripe_webhook_secret as string | null)?.trim() || null,
      webhookColumnMissing: false,
    };
  }

  const message = error.message ?? "";
  if (message.includes("stripe_webhook_secret")) {
    const { data: legacy } = await admin
      .from("admin_config")
      .select("stripe_finance_secret_key")
      .eq("id", 1)
      .maybeSingle();

    return {
      secretKey:
        (legacy?.stripe_finance_secret_key as string | null)?.trim() || null,
      webhookSecret: null,
      webhookColumnMissing: true,
    };
  }

  console.warn("[stripe] admin_config read failed:", message);
  return {
    secretKey: null,
    webhookSecret: null,
    webhookColumnMissing: false,
  };
}

export async function resolveStripeCredentials(): Promise<StripeCredentials> {
  const envSecret = envStripeSecret();
  const envWebhook = envStripeWebhook();
  const { secretKey: dbSecret, webhookSecret: dbWebhook, webhookColumnMissing } =
    await readAdminStripeFromDb();

  const secretKey = envSecret || dbSecret;
  const webhookSecret = envWebhook || dbWebhook;

  return {
    secretKey,
    webhookSecret,
    secretSource: secretKey ? (envSecret ? "env" : "database") : null,
    webhookSource: webhookSecret ? (envWebhook ? "env" : "database") : null,
    webhookColumnMissing,
  };
}
