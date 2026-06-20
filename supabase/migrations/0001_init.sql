-- ─────────────────────────────────────────────────────────────────────────────
-- Linker — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Multi-tenant: every row belongs to an auth.users id and is protected by RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles (1:1 with auth.users) ───────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  plan text not null default 'free' check (plan in ('free', 'pro')),
  billing_interval text check (billing_interval in ('monthly', 'yearly')),
  created_at timestamptz not null default now()
);

-- ── App settings (ElevenLabs + forwarding + appointment), 1:1 with user ──────
create table if not exists public.app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  connected boolean not null default false,
  workspace_info text,
  agent_id text,
  agent_name text,
  voice_id text,
  voice_name text,
  language text,
  greeting text,
  system_prompt text,
  customer_number text,
  customer_number_label text,
  forwarding_type text check (forwarding_type in ('alle', 'bedingt')),
  forwarding_status text
    check (forwarding_status in ('nicht_eingerichtet', 'anleitung', 'aktiv')),
  forwarding_activated_at timestamptz,
  appointment_booking_enabled boolean not null default false,
  appointment_provider text
    check (appointment_provider in ('google', 'microsoft', 'apple')),
  last_sync timestamptz,
  updated_at timestamptz not null default now()
);

-- One agent maps to exactly one user (used to attribute inbound webhooks).
create unique index if not exists app_settings_agent_id_idx
  on public.app_settings (agent_id)
  where agent_id is not null;

-- ── Calls (the dashboard feed; written by the post-call webhook) ─────────────
create table if not exists public.calls (
  id text primary key,                 -- ElevenLabs conversation_id (or generated)
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  caller_name text,
  caller_phone text,
  property text,
  started_at timestamptz not null default now(),
  duration_seconds integer not null default 0,
  summary text,
  category text,
  urgency text,
  status text,
  transcript jsonb not null default '[]'::jsonb,
  structured_summary jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists calls_user_started_idx
  on public.calls (user_id, started_at desc);

-- ── Calendar connections (one row per provider per user) ─────────────────────
create table if not exists public.calendars (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'apple')),
  connected boolean not null default false,
  account_label text,
  connected_at timestamptz,
  access_token text,
  refresh_token text,
  expires_at bigint,
  app_password text,
  caldav_calendar_url text,
  primary key (user_id, provider)
);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.calls        enable row level security;
alter table public.calendars    enable row level security;

-- Profiles: owner can read/update their own row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- App settings: full ownership by user_id.
drop policy if exists "settings_all_own" on public.app_settings;
create policy "settings_all_own" on public.app_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Calls: full ownership by user_id.
drop policy if exists "calls_all_own" on public.calls;
create policy "calls_all_own" on public.calls
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Calendars: full ownership by user_id.
drop policy if exists "calendars_all_own" on public.calendars;
create policy "calendars_all_own" on public.calendars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Auto-provision profile + settings on signup ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  insert into public.app_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
