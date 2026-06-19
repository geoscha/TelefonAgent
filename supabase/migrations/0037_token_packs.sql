alter table public.admin_config
  add column if not exists token_packs jsonb not null default '[]'::jsonb;
