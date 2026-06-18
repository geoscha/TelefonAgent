-- ── Per-user Cura forwarding number (Option B: number pool) ───────────────────

alter table public.app_settings
  add column if not exists cura_forwarding_number text,
  add column if not exists elevenlabs_phone_number_id text;

create unique index if not exists app_settings_cura_number_idx
  on public.app_settings (cura_forwarding_number)
  where cura_forwarding_number is not null;

-- Pool of ElevenLabs-connected DIDs; each row can be assigned to at most one user.
create table if not exists public.forwarding_number_pool (
  phone_number text primary key,
  elevenlabs_phone_number_id text not null unique,
  assigned_user_id uuid references auth.users (id) on delete set null,
  assigned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists forwarding_pool_unassigned_idx
  on public.forwarding_number_pool (assigned_user_id)
  where assigned_user_id is null;

alter table public.forwarding_number_pool enable row level security;

drop policy if exists "pool_read_own" on public.forwarding_number_pool;
create policy "pool_read_own" on public.forwarding_number_pool
  for select using (assigned_user_id = auth.uid());
