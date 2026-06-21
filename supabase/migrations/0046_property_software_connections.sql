-- Property-management ERP integrations (ImmoTop2, Abacus)
-- Stores per-user REST base URL + Basic Auth credentials.

create table if not exists public.property_software_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('immotop2', 'abacus')),
  connected boolean not null default false,
  account_label text,
  base_url text,
  username text,
  password text,
  connected_at timestamptz,
  primary key (user_id, provider)
);

alter table public.property_software_connections enable row level security;

drop policy if exists "property_software_connections_all_own"
  on public.property_software_connections;
create policy "property_software_connections_all_own"
  on public.property_software_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
