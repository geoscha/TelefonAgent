import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface EnrichmentConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fromAdmin: boolean;
}

export interface EnrichmentConfigPublic {
  configured: boolean;
  apiKeyMasked: string;
  baseUrl: string;
  model: string;
  fromEnv: boolean;
}

function maskSecret(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "••••";
  return `${"•".repeat(8)}${value.slice(-visible)}`;
}

function envDefaults(): EnrichmentConfig {
  return {
    apiKey: process.env.ENRICHMENT_API_KEY?.trim() ?? "",
    baseUrl: (
      process.env.ENRICHMENT_BASE_URL ?? "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: process.env.ENRICHMENT_MODEL?.trim() || "gpt-4o-mini",
    fromAdmin: false,
  };
}

export async function getEnrichmentConfig(): Promise<EnrichmentConfig> {
  const env = envDefaults();
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("enrichment_api_key, enrichment_base_url, enrichment_model")
    .eq("id", 1)
    .maybeSingle();

  const dbKey = (data?.enrichment_api_key as string | null)?.trim() ?? "";
  const dbBase = (data?.enrichment_base_url as string | null)?.trim() ?? "";
  const dbModel = (data?.enrichment_model as string | null)?.trim() ?? "";

  if (dbKey) {
    return {
      apiKey: dbKey,
      baseUrl: (dbBase || env.baseUrl).replace(/\/$/, ""),
      model: dbModel || env.model,
      fromAdmin: true,
    };
  }

  return env;
}

export async function getEnrichmentConfigPublic(): Promise<EnrichmentConfigPublic> {
  const config = await getEnrichmentConfig();
  const env = envDefaults();
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("enrichment_api_key, enrichment_base_url, enrichment_model")
    .eq("id", 1)
    .maybeSingle();

  const dbKey = (data?.enrichment_api_key as string | null)?.trim() ?? "";
  const dbBase = (data?.enrichment_base_url as string | null)?.trim() ?? "";
  const dbModel = (data?.enrichment_model as string | null)?.trim() ?? "";

  return {
    configured: Boolean(config.apiKey),
    apiKeyMasked: dbKey
      ? maskSecret(dbKey)
      : env.apiKey
        ? `${maskSecret(env.apiKey)} (Env)`
        : "",
    baseUrl: dbBase || env.baseUrl,
    model: dbModel || env.model,
    fromEnv: !dbKey && Boolean(env.apiKey),
  };
}

export async function updateEnrichmentConfig(patch: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  clearApiKey?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.apiKey !== undefined) {
    row.enrichment_api_key = patch.apiKey.trim() || null;
  }
  if (patch.clearApiKey) {
    row.enrichment_api_key = null;
  }
  if (patch.baseUrl !== undefined) {
    row.enrichment_base_url = patch.baseUrl.trim() || null;
  }
  if (patch.model !== undefined) {
    row.enrichment_model = patch.model.trim() || null;
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
    const envCreds = envAdminCredentials();
    await admin.from("admin_config").insert({
      id: 1,
      username: envCreds.username,
      code_hash: hashAdminCode(envCreds.code),
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
