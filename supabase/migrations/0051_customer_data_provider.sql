alter table public.app_settings
  add column if not exists customer_data_provider text;
