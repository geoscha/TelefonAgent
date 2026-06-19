import "server-only";

import { updateDemoOutboundConfig } from "@/lib/admin/demo-config";
import { updateEnrichmentConfig } from "@/lib/admin/enrichment-config";
import { updateFinanceIntegrations } from "@/lib/admin/finance-integrations";
import {
  updateElevenLabsAccount,
  updateTwilioAccount,
} from "@/lib/admin/integration-profiles";
import type { AdminSecretEditAction } from "@/lib/admin/secrets-inventory-types";

export async function applyAdminSecretUpdate(
  action: AdminSecretEditAction,
  value: string
): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Bitte einen Wert eingeben.");
  }

  switch (action.type) {
    case "finance_stripe":
      await updateFinanceIntegrations({ stripeSecretKey: trimmed });
      return;
    case "finance_stripe_webhook":
      await updateFinanceIntegrations({ stripeWebhookSecret: trimmed });
      return;
    case "finance_twilio_sid":
      await updateFinanceIntegrations({ twilioAccountSid: trimmed });
      return;
    case "finance_twilio_token":
      await updateFinanceIntegrations({ twilioAuthToken: trimmed });
      return;
    case "finance_elevenlabs":
      await updateFinanceIntegrations({ elevenLabsApiKey: trimmed });
      return;
    case "enrichment_api_key":
      await updateEnrichmentConfig({ apiKey: trimmed });
      return;
    case "enrichment_base_url":
      await updateEnrichmentConfig({ baseUrl: trimmed });
      return;
    case "enrichment_model":
      await updateEnrichmentConfig({ model: trimmed });
      return;
    case "demo_phone":
      await updateDemoOutboundConfig({ phoneNumber: trimmed });
      return;
    case "twilio_sid":
      await updateTwilioAccount({
        id: action.profileId,
        accountSid: trimmed,
      });
      return;
    case "twilio_token":
      await updateTwilioAccount({
        id: action.profileId,
        authToken: trimmed,
      });
      return;
    case "elevenlabs_api":
      await updateElevenLabsAccount({
        id: action.profileId,
        apiKey: trimmed,
      });
      return;
    default:
      throw new Error("Dieser Eintrag kann nicht bearbeitet werden.");
  }
}
