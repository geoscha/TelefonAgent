-- Finance API credentials (service-role only, no RLS policies)

alter table public.admin_config
  add column if not exists twilio_account_sid text,
  add column if not exists twilio_auth_token text,
  add column if not exists elevenlabs_finance_api_key text,
  add column if not exists usd_to_chf_rate numeric not null default 0.88;
