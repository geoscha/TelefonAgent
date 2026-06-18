-- ── Multiple phone numbers per user (pool + SIP trunk) ───────────────────────

create table if not exists public.user_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_number text not null,
  elevenlabs_phone_number_id text,
  source text not null check (source in ('pool', 'sip_trunk')),
  label text,
  is_primary boolean not null default false,
  forwarding_type text check (forwarding_type in ('alle', 'bedingt')),
  forwarding_status text
    check (forwarding_status in ('nicht_eingerichtet', 'anleitung', 'aktiv')),
  sip_outbound_address text,
  sip_outbound_transport text,
  validation_status text not null default 'valid'
    check (validation_status in ('pending', 'valid', 'invalid')),
  validation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phone_number)
);

create unique index if not exists user_phone_numbers_primary_idx
  on public.user_phone_numbers (user_id)
  where is_primary = true;

create unique index if not exists user_phone_numbers_el_id_idx
  on public.user_phone_numbers (elevenlabs_phone_number_id)
  where elevenlabs_phone_number_id is not null;

create index if not exists user_phone_numbers_user_idx
  on public.user_phone_numbers (user_id, created_at desc);

alter table public.user_phone_numbers enable row level security;

drop policy if exists "user_phone_numbers_all_own" on public.user_phone_numbers;
create policy "user_phone_numbers_all_own" on public.user_phone_numbers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migrate existing single-number users from app_settings + pool.
insert into public.user_phone_numbers (
  user_id,
  phone_number,
  elevenlabs_phone_number_id,
  source,
  is_primary,
  forwarding_type,
  forwarding_status,
  validation_status
)
select
  s.user_id,
  s.cura_forwarding_number,
  s.elevenlabs_phone_number_id,
  case
    when p.phone_number is not null then 'pool'
    else 'sip_trunk'
  end,
  true,
  s.forwarding_type,
  s.forwarding_status,
  'valid'
from public.app_settings s
left join public.forwarding_number_pool p
  on p.phone_number = s.cura_forwarding_number
  and p.assigned_user_id = s.user_id
where s.cura_forwarding_number is not null
on conflict (user_id, phone_number) do nothing;
