-- Multiple Twilio / ElevenLabs accounts for admin provisioning.

create table if not exists public.admin_twilio_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  account_sid text not null,
  auth_token text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_elevenlabs_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  api_key text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.admin_twilio_accounts enable row level security;
alter table public.admin_elevenlabs_accounts enable row level security;

create index if not exists admin_twilio_accounts_default_idx
  on public.admin_twilio_accounts (is_default)
  where is_default = true;

create index if not exists admin_elevenlabs_accounts_default_idx
  on public.admin_elevenlabs_accounts (is_default)
  where is_default = true;

-- Migrate legacy single credentials from admin_config.
insert into public.admin_twilio_accounts (label, account_sid, auth_token, is_default)
select
  'Hauptkonto',
  twilio_account_sid,
  twilio_auth_token,
  true
from public.admin_config
where id = 1
  and length(trim(twilio_account_sid)) > 0
  and length(trim(twilio_auth_token)) > 0
  and trim(twilio_account_sid) ~ '^AC[0-9a-fA-F]{32}$'
  and not exists (select 1 from public.admin_twilio_accounts limit 1);

insert into public.admin_elevenlabs_accounts (label, api_key, is_default)
select
  'Hauptkonto',
  elevenlabs_finance_api_key,
  true
from public.admin_config
where id = 1
  and elevenlabs_finance_api_key is not null
  and trim(elevenlabs_finance_api_key) <> ''
  and not exists (select 1 from public.admin_elevenlabs_accounts limit 1);
