-- Tombstones for calls removed from history (prevents ElevenLabs re-sync).
create table if not exists public.deleted_calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  call_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, call_id)
);

create index if not exists deleted_calls_user_idx
  on public.deleted_calls (user_id);

alter table public.deleted_calls enable row level security;

drop policy if exists "deleted_calls_all_own" on public.deleted_calls;
create policy "deleted_calls_all_own" on public.deleted_calls
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
