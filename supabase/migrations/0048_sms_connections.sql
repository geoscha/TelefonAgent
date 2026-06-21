-- SMS gateway integrations (Twilio, Seven.io, ASPSMS)
-- One row per provider; only one SMS gateway should be active per user at a time.

create table if not exists public.sms_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('twilio', 'seven', 'aspsms')),
  connected boolean not null default false,
  account_label text,
  sender_id text,
  username text,
  password text,
  connected_at timestamptz,
  primary key (user_id, provider)
);

alter table public.sms_connections enable row level security;

drop policy if exists "sms_connections_all_own" on public.sms_connections;
create policy "sms_connections_all_own"
  on public.sms_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
