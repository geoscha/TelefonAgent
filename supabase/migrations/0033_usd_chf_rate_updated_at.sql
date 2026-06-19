alter table public.admin_config
  add column if not exists usd_to_chf_updated_at timestamptz;
