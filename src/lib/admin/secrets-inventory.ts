import "server-only";

import { getDemoOutboundConfigPublic } from "@/lib/admin/demo-config";
import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import { getFinanceIntegrations } from "@/lib/admin/finance-integrations";
import { resolveStripeCredentials } from "@/lib/billing/stripe-credentials";
import type {
  AdminSecretEditAction,
  AdminSecretEntry,
  AdminSecretInputType,
  AdminSecretSource,
} from "@/lib/admin/secrets-inventory-types";
import { createAdminClient } from "@/lib/supabase/admin";

export type { AdminSecretEntry, AdminSecretSource } from "@/lib/admin/secrets-inventory-types";

export function maskAdminSecret(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "••••";
  return `${"•".repeat(Math.min(12, value.length - visible))}${value.slice(-visible)}`;
}

function envSecret(
  id: string,
  label: string,
  category: string,
  envVar: string,
  visible = 4
): AdminSecretEntry {
  const value = process.env[envVar]?.trim() ?? "";
  return {
    id,
    label,
    category,
    source: "env",
    configured: Boolean(value),
    masked: value ? maskAdminSecret(value, visible) : "—",
    value,
    hint: envVar,
    editable: false,
    inputType: "secret",
  };
}

function valueSecret(
  id: string,
  label: string,
  category: string,
  source: AdminSecretSource,
  value: string,
  options?: {
    hint?: string;
    visible?: number;
    editable?: boolean;
    editAction?: AdminSecretEditAction;
    inputType?: AdminSecretInputType;
  }
): AdminSecretEntry {
  const trimmed = value.trim();
  return {
    id,
    label,
    category,
    source,
    configured: Boolean(trimmed),
    masked: trimmed ? maskAdminSecret(trimmed, options?.visible ?? 4) : "—",
    value: trimmed,
    hint: options?.hint,
    editable: options?.editable ?? false,
    editAction: options?.editAction,
    inputType: options?.inputType ?? "secret",
  };
}

export async function getAdminSecretsInventory(): Promise<AdminSecretEntry[]> {
  const admin = createAdminClient();
  const entries: AdminSecretEntry[] = [];

  const pushEnv = (
    id: string,
    label: string,
    category: string,
    envVar: string,
    visible?: number
  ) => {
    entries.push(envSecret(id, label, category, envVar, visible));
  };

  pushEnv("supabase-url", "Supabase URL", "Supabase", "NEXT_PUBLIC_SUPABASE_URL", 8);
  pushEnv(
    "supabase-anon",
    "Supabase Anon Key",
    "Supabase",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
  pushEnv(
    "supabase-service",
    "Supabase Service Role",
    "Supabase",
    "SUPABASE_SERVICE_ROLE_KEY"
  );

  pushEnv("admin-session", "Admin Session Secret", "Admin", "ADMIN_SESSION_SECRET");

  pushEnv("elevenlabs-api", "ElevenLabs API Key", "ElevenLabs", "ELEVENLABS_API_KEY");
  pushEnv(
    "elevenlabs-webhook",
    "ElevenLabs Webhook Secret",
    "ElevenLabs",
    "ELEVENLABS_WEBHOOK_SECRET"
  );

  const stripeCreds = await resolveStripeCredentials();
  if (stripeCreds.secretSource === "env") {
    pushEnv("stripe-billing-env", "Stripe Secret Key (Vercel)", "Stripe", "STRIPE_SECRET_KEY");
  }
  if (stripeCreds.webhookSource === "env") {
    pushEnv(
      "stripe-webhook-env",
      "Stripe Webhook Secret (Vercel)",
      "Stripe",
      "STRIPE_WEBHOOK_SECRET"
    );
  }

  const finance = await getFinanceIntegrations();
  entries.push(
    valueSecret(
      "stripe-secret-db",
      "Stripe Secret Key",
      "Stripe",
      "database",
      finance.stripeSecretKey,
      {
        hint: "admin_config · Abrechnung & Finanzen",
        editable: true,
        editAction: { type: "finance_stripe" },
      }
    ),
    valueSecret(
      "stripe-webhook-db",
      "Stripe Webhook Secret",
      "Stripe",
      "database",
      finance.stripeWebhookSecret,
      {
        hint: "admin_config · checkout.session.completed",
        editable: true,
        editAction: { type: "finance_stripe_webhook" },
      }
    )
  );

  pushEnv("google-client-id", "Google Client ID", "Kalender", "GOOGLE_CLIENT_ID", 8);
  pushEnv(
    "google-client-secret",
    "Google Client Secret",
    "Kalender",
    "GOOGLE_CLIENT_SECRET"
  );
  pushEnv(
    "microsoft-client-id",
    "Microsoft Client ID",
    "Kalender",
    "MICROSOFT_CLIENT_ID",
    8
  );
  pushEnv(
    "microsoft-client-secret",
    "Microsoft Client Secret",
    "Kalender",
    "MICROSOFT_CLIENT_SECRET"
  );

  const enrichment = await getEnrichmentConfig();
  entries.push(
    valueSecret(
      "enrichment-api",
      "OpenAI / Enrichment API Key",
      "KI & Anreicherung",
      enrichment.fromAdmin ? "database" : "env",
      enrichment.apiKey,
      {
        hint: enrichment.fromAdmin
          ? "admin_config.enrichment_api_key"
          : "ENRICHMENT_API_KEY (Speichern → DB)",
        editable: true,
        editAction: { type: "enrichment_api_key" },
      }
    ),
    valueSecret(
      "enrichment-base-url",
      "Enrichment Base URL",
      "KI & Anreicherung",
      "database",
      enrichment.baseUrl,
      {
        hint: "admin_config.enrichment_base_url",
        editable: true,
        editAction: { type: "enrichment_base_url" },
        inputType: "text",
        visible: 8,
      }
    ),
    valueSecret(
      "enrichment-model",
      "Enrichment Modell",
      "KI & Anreicherung",
      "database",
      enrichment.model,
      {
        hint: "admin_config.enrichment_model",
        editable: true,
        editAction: { type: "enrichment_model" },
        inputType: "text",
        visible: 6,
      }
    )
  );

  pushEnv("agent-tool", "Agent Tool Secret", "Agent", "AGENT_TOOL_SECRET");
  pushEnv("resend", "Resend API Key", "E-Mail", "RESEND_API_KEY");

  const demoConfig = await getDemoOutboundConfigPublic();
  entries.push(
    valueSecret(
      "demo-phone",
      "Demo-Nummer",
      "Demo",
      "database",
      demoConfig.phoneNumber ?? "",
      {
        hint: "admin_config.demo_outbound_phone_number",
        editable: true,
        editAction: { type: "demo_phone" },
        inputType: "tel",
        visible: 6,
      }
    )
  );

  pushEnv("demo-agent-id", "Demo Agent ID", "Demo", "DEMO_AGENT_ID", 6);
  pushEnv(
    "demo-phone-id",
    "Demo Phone Number ID",
    "Demo",
    "DEMO_AGENT_PHONE_NUMBER_ID",
    6
  );

  const { data: twilioRows } = await admin
    .from("admin_twilio_accounts")
    .select("id, label, account_sid, auth_token, is_default")
    .order("created_at", { ascending: true });

  for (const row of twilioRows ?? []) {
    const profileId = row.id as string;
    const suffix = row.is_default ? " · Standard" : "";
    const baseLabel = `${row.label as string}${suffix}`;
    entries.push(
      valueSecret(
        `twilio-sid-${profileId}`,
        `Twilio · ${baseLabel} · Account SID`,
        "Twilio",
        "database",
        row.account_sid as string,
        {
          hint: "admin_twilio_accounts",
          visible: 6,
          editable: true,
          editAction: { type: "twilio_sid", profileId },
        }
      ),
      valueSecret(
        `twilio-token-${profileId}`,
        `Twilio · ${baseLabel} · Auth Token`,
        "Twilio",
        "database",
        row.auth_token as string,
        {
          hint: "admin_twilio_accounts",
          editable: true,
          editAction: { type: "twilio_token", profileId },
        }
      )
    );
  }

  const legacyTwilioSid = finance.twilioAccountSid;
  const legacyTwilioToken = finance.twilioAuthToken;
  const hasProfileTwilio = (twilioRows ?? []).length > 0;
  if (!hasProfileTwilio) {
    entries.push(
      valueSecret(
        "twilio-legacy-sid",
        "Twilio · Legacy · Account SID",
        "Twilio",
        "database",
        legacyTwilioSid,
        {
          hint: "admin_config.twilio_account_sid",
          visible: 6,
          editable: true,
          editAction: { type: "finance_twilio_sid" },
        }
      ),
      valueSecret(
        "twilio-legacy-token",
        "Twilio · Legacy · Auth Token",
        "Twilio",
        "database",
        legacyTwilioToken,
        {
          hint: "admin_config.twilio_auth_token",
          editable: true,
          editAction: { type: "finance_twilio_token" },
        }
      )
    );
  }

  const { data: elRows } = await admin
    .from("admin_elevenlabs_accounts")
    .select("id, label, api_key, is_default")
    .order("created_at", { ascending: true });

  for (const row of elRows ?? []) {
    const profileId = row.id as string;
    const suffix = row.is_default ? " · Standard" : "";
    entries.push(
      valueSecret(
        `elevenlabs-db-${profileId}`,
        `ElevenLabs · ${row.label as string}${suffix}`,
        "ElevenLabs",
        "database",
        row.api_key as string,
        {
          hint: "admin_elevenlabs_accounts",
          editable: true,
          editAction: { type: "elevenlabs_api", profileId },
        }
      )
    );
  }

  const legacyElKey = (
    await admin
      .from("admin_config")
      .select("elevenlabs_finance_api_key")
      .eq("id", 1)
      .maybeSingle()
  ).data?.elevenlabs_finance_api_key as string | undefined;

  if (!(elRows ?? []).length) {
    entries.push(
      valueSecret(
        "elevenlabs-finance-legacy",
        "ElevenLabs · Legacy (Finanzen)",
        "ElevenLabs",
        "database",
        legacyElKey?.trim() ?? "",
        {
          hint: "admin_config.elevenlabs_finance_api_key",
          editable: true,
          editAction: { type: "finance_elevenlabs" },
        }
      )
    );
  }

  return entries;
}

export function groupAdminSecrets(
  entries: AdminSecretEntry[]
): Record<string, AdminSecretEntry[]> {
  const groups: Record<string, AdminSecretEntry[]> = {};
  for (const entry of entries) {
    if (!groups[entry.category]) groups[entry.category] = [];
    groups[entry.category].push(entry);
  }
  return groups;
}

export async function findAdminSecretEntry(
  id: string
): Promise<AdminSecretEntry | undefined> {
  const secrets = await getAdminSecretsInventory();
  return secrets.find((entry) => entry.id === id);
}
