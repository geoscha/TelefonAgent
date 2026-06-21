-- Calendar events mirror. Linker periodically pulls upcoming events from the
-- connected calendar (Google/Microsoft/Apple) into this table. During a live
-- phone call the agent reads availability ONLY from this mirror — never live
-- from the external calendar API — for low latency and resilience across any
-- mix of integrations. Bookings still write through to the real calendar and
-- update this mirror immediately so the rest of the call stays consistent.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  external_id text not null,
  event_url text,
  title text,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  cancelled boolean not null default false,
  agent_created boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create index if not exists calendar_events_user_start_idx
  on public.calendar_events (user_id, start_at);

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events_all_own" on public.calendar_events;
create policy "calendar_events_all_own"
  on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Last successful calendar-mirror refresh per user (used for staleness checks).
alter table public.app_settings
  add column if not exists calendar_mirror_synced_at timestamptz;
