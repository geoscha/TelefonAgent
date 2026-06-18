-- ── User requests (admin workflow) ───────────────────────────────────────────

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  status text not null default 'offen'
    check (status in ('offen', 'in_arbeit', 'erledigt', 'abgelehnt')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_user_id_idx on public.requests (user_id);
create index if not exists requests_created_at_idx on public.requests (created_at desc);

alter table public.requests enable row level security;

drop policy if exists "requests_select_own" on public.requests;
create policy "requests_select_own" on public.requests
  for select using (auth.uid() = user_id);

drop policy if exists "requests_insert_own" on public.requests;
create policy "requests_insert_own" on public.requests
  for insert with check (auth.uid() = user_id);

-- ── Admin credentials (service-role only; no client policies) ────────────────

create table if not exists public.admin_config (
  id int primary key default 1 check (id = 1),
  username text not null,
  code_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_config enable row level security;
-- Intentionally no policies: only service_role can read/write.
