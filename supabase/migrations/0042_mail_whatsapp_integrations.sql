-- E-Mail- und WhatsApp-Integrationen

create table if not exists public.mail_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook', 'apple_mail')),
  connected boolean not null default false,
  account_label text,
  connected_at timestamptz,
  access_token text,
  refresh_token text,
  expires_at bigint,
  app_password text,
  primary key (user_id, provider)
);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_number_id uuid not null references public.user_phone_numbers (id) on delete cascade,
  account_type text not null check (account_type in ('business', 'personal')),
  connected boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phone_number_id)
);

create index if not exists whatsapp_connections_user_idx
  on public.whatsapp_connections (user_id, connected_at desc);

alter table public.mail_connections enable row level security;
alter table public.whatsapp_connections enable row level security;

drop policy if exists "mail_connections_all_own" on public.mail_connections;
create policy "mail_connections_all_own" on public.mail_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "whatsapp_connections_all_own" on public.whatsapp_connections;
create policy "whatsapp_connections_all_own" on public.whatsapp_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
