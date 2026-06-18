-- Stripe secret for admin finance revenue (service-role only)

alter table public.admin_config
  add column if not exists stripe_finance_secret_key text;
