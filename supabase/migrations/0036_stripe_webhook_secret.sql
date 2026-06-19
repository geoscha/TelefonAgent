alter table public.admin_config
  add column if not exists stripe_webhook_secret text;
