-- AI-analyzed message inquiries: draft replies + executable action plans.
-- Only threads classified as actionable (solvable with calendar/customer data) appear in Nachrichten.

create table if not exists public.message_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text not null,
  channel_type text not null,
  channel_ref text not null,
  agent_id text,
  actionable boolean not null default false,
  summary text,
  draft_reply text,
  suggested_actions jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  resolved_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, thread_id)
);

create index if not exists message_inquiries_user_channel_idx
  on public.message_inquiries (user_id, channel_type, channel_ref, status);

alter table public.message_inquiries enable row level security;

drop policy if exists "message_inquiries_all_own" on public.message_inquiries;
create policy "message_inquiries_all_own"
  on public.message_inquiries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
