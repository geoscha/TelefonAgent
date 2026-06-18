import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface FinanceIntegrationConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  elevenLabsApiKey: string;
  usdToChfRate: number;
}

export interface FinanceIntegrationPublic {
  twilioConfigured: boolean;
  elevenLabsConfigured: boolean;
  twilioAccountSidMasked: string;
  elevenLabsKeyMasked: string;
  usdToChfRate: number;
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
      "twilio_account_sid, twilio_auth_token, elevenlabs_finance_api_key, usd_to_chf_rate"
    )
    .eq("id", 1)
    .maybeSingle();

  const rate = Number(data?.usd_to_chf_rate);
  return {
    twilioAccountSid: (data?.twilio_account_sid as string) ?? "",
    twilioAuthToken: (data?.twilio_auth_token as string) ?? "",
    elevenLabsApiKey:
      (data?.elevenlabs_finance_api_key as string)?.trim() ||
      envElevenLabsKey(),
    usdToChfRate: Number.isFinite(rate) && rate > 0 ? rate : 0.88,
  };
}

export async function getFinanceIntegrationsPublic(): Promise<FinanceIntegrationPublic> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select(
      "twilio_account_sid, twilio_auth_token, elevenlabs_finance_api_key, usd_to_chf_rate"
    )
    .eq("id", 1)
    .maybeSingle();

  const sid = (data?.twilio_account_sid as string) ?? "";
  const token = (data?.twilio_auth_token as string) ?? "";
  const elKey = (data?.elevenlabs_finance_api_key as string) ?? "";
  const envKey = envElevenLabsKey();
  const rate = Number(data?.usd_to_chf_rate);

  return {
    twilioConfigured: Boolean(sid && token),
    elevenLabsConfigured: Boolean(elKey || envKey),
    twilioAccountSidMasked: sid ? maskSecret(sid, 6) : "",
    elevenLabsKeyMasked: elKey
      ? maskSecret(elKey)
      : envKey
        ? `${maskSecret(envKey)} (Env)`
        : "",
    usdToChfRate: Number.isFinite(rate) && rate > 0 ? rate : 0.88,
    elevenLabsFromEnv: !elKey && Boolean(envKey),
  };
}

export async function updateFinanceIntegrations(patch: {
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  elevenLabsApiKey?: string;
  usdToChfRate?: number;
  clearTwilio?: boolean;
  clearElevenLabs?: boolean;
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
  if (patch.usdToChfRate !== undefined) {
    const rate = patch.usdToChfRate;
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("USD/CHF Kurs muss grösser als 0 sein.");
    }
    row.usd_to_chf_rate = rate;
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
