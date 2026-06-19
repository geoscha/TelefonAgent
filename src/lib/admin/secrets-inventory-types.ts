export type AdminSecretSource = "env" | "database";

export type AdminSecretInputType = "secret" | "text" | "tel";

export type AdminSecretEditAction =
  | { type: "finance_stripe" }
  | { type: "finance_stripe_webhook" }
  | { type: "finance_twilio_sid" }
  | { type: "finance_twilio_token" }
  | { type: "finance_elevenlabs" }
  | { type: "enrichment_api_key" }
  | { type: "enrichment_base_url" }
  | { type: "enrichment_model" }
  | { type: "demo_phone" }
  | { type: "twilio_sid"; profileId: string }
  | { type: "twilio_token"; profileId: string }
  | { type: "elevenlabs_api"; profileId: string };

export interface AdminSecretEntry {
  id: string;
  label: string;
  category: string;
  source: AdminSecretSource;
  configured: boolean;
  masked: string;
  value: string;
  hint?: string;
  editable: boolean;
  editAction?: AdminSecretEditAction;
  inputType?: AdminSecretInputType;
}
