import "server-only";

import { getUsdToChfRate } from "@/lib/admin/usd-chf-rate";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FinanceIntegrationConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  elevenLabsApiKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  usdToChfRate: number;
}

export interface FinanceIntegrationPublic {
  twilioConfigured: boolean;
  elevenLabsConfigured: boolean;
  stripeConfigured: boolean;
  twilioAccountSidMasked: string;
  elevenLabsKeyMasked: string;
  stripeKeyMasked: string;
  usdToChfRate: number;
  usdToChfUpdatedAt: string | null;
  usdToChfSource: "live" | "cached" | "fallback";
  elevenLabsFromEnv: boolean;
}

function maskSecret(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "••••";
  return `${"•".repeat(8)}${value.slice(-visible)}`;
}

function envElevenLabsKey(): string {
  return process.env.ELEVENLABS_API_KEY?.trim() ?? "";
}

export async function getFinanceIntegrations(): Promise<FinanceIntegrationConfig> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select(
      "twilio_account_sid, twilio_auth_token, elevenlabs_finance_api_key, stripe_finance_secret_key, stripe_webhook_secret"
    )
    .eq("id", 1)
    .maybeSingle();

  const stripeDb = (data?.stripe_finance_secret_key as string)?.trim() ?? "";
  const stripeWebhookDb =
    (data?.stripe_webhook_secret as string)?.trim() ?? "";

  let twilioAccountSid = (data?.twilio_account_sid as string)?.trim() ?? "";
  let twilioAuthToken = (data?.twilio_auth_token as string)?.trim() ?? "";
  let elevenLabsApiKey =
    (data?.elevenlabs_finance_api_key as string)?.trim() || envElevenLabsKey();

  const { data: twilioProfile } = await admin
    .from("admin_twilio_accounts")
    .select("account_sid, auth_token")
    .eq("is_default", true)
    .maybeSingle();

  if (
    twilioProfile?.account_sid?.trim() &&
    twilioProfile?.auth_token?.trim()
  ) {
    twilioAccountSid = twilioProfile.account_sid.trim();
    twilioAuthToken = twilioProfile.auth_token.trim();
  }

  const { data: elProfile } = await admin
    .from("admin_elevenlabs_accounts")
    .select("api_key")
    .eq("is_default", true)
    .maybeSingle();

  if (elProfile?.api_key?.trim()) {
    elevenLabsApiKey = elProfile.api_key.trim();
  }

  const { rate: usdToChfRate } = await getUsdToChfRate();

  return {
    twilioAccountSid,
    twilioAuthToken,
    elevenLabsApiKey,
    stripeSecretKey: stripeDb,
    stripeWebhookSecret: stripeWebhookDb,
    usdToChfRate,
  };
}

export async function getFinanceIntegrationsPublic(): Promise<FinanceIntegrationPublic> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select(
      "twilio_account_sid, twilio_auth_token, elevenlabs_finance_api_key, stripe_finance_secret_key"
    )
    .eq("id", 1)
    .maybeSingle();

  const sid = (data?.twilio_account_sid as string) ?? "";
  const token = (data?.twilio_auth_token as string) ?? "";
  const elKey = (data?.elevenlabs_finance_api_key as string) ?? "";
  const stripeKey = (data?.stripe_finance_secret_key as string) ?? "";
  const envKey = envElevenLabsKey();
  const {
    rate: usdToChfRate,
    updatedAt: usdToChfUpdatedAt,
    source: usdToChfSource,
  } = await getUsdToChfRate();

  return {
    twilioConfigured: Boolean(sid && token),
    elevenLabsConfigured: Boolean(elKey || envKey),
    stripeConfigured: Boolean(stripeKey),
    twilioAccountSidMasked: sid ? maskSecret(sid, 6) : "",
    elevenLabsKeyMasked: elKey
      ? maskSecret(elKey)
      : envKey
        ? `${maskSecret(envKey)} (Env)`
        : "",
    stripeKeyMasked: stripeKey ? maskSecret(stripeKey) : "",
    usdToChfRate,
    usdToChfUpdatedAt,
    usdToChfSource,
    elevenLabsFromEnv: !elKey && Boolean(envKey),
  };
}

export async function updateFinanceIntegrations(patch: {
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  elevenLabsApiKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  clearTwilio?: boolean;
  clearElevenLabs?: boolean;
  clearStripe?: boolean;
  clearStripeWebhook?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.twilioAccountSid !== undefined) {
    row.twilio_account_sid = patch.twilioAccountSid.trim() || null;
  }
  if (patch.twilioAuthToken !== undefined) {
    row.twilio_auth_token = patch.twilioAuthToken.trim() || null;
  }
  if (patch.clearTwilio) {
    row.twilio_account_sid = null;
    row.twilio_auth_token = null;
  }
  if (patch.elevenLabsApiKey !== undefined) {
    row.elevenlabs_finance_api_key = patch.elevenLabsApiKey.trim() || null;
  }
  if (patch.clearElevenLabs) {
    row.elevenlabs_finance_api_key = null;
  }
  if (patch.stripeSecretKey !== undefined) {
    row.stripe_finance_secret_key = patch.stripeSecretKey.trim() || null;
  }
  if (patch.clearStripe) {
    row.stripe_finance_secret_key = null;
  }
  if (patch.stripeWebhookSecret !== undefined) {
    row.stripe_webhook_secret = patch.stripeWebhookSecret.trim() || null;
  }
  if (patch.clearStripeWebhook) {
    row.stripe_webhook_secret = null;
  }

  const { data: existing } = await admin
    .from("admin_config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();

  if (!existing) {
    const { envAdminCredentials, hashAdminCode } = await import(
      "@/lib/admin/crypto"
    );
    const env = envAdminCredentials();
    await admin.from("admin_config").insert({
      id: 1,
      username: env.username,
      code_hash: hashAdminCode(env.code),
      ...row,
    });
    return;
  }

  const { error } = await admin
    .from("admin_config")
    .update(row)
    .eq("id", 1);
  if (error) throw error;
}

export function usdToChf(usd: number, rate: number): number {
  return usd * rate;
}
