-- Synced tenant/customer master data mirrored from Excel/CSV/ERP.
-- The phone agent identifies callers by phone number ONLY from this table —
-- never by reading the source file live during a call.

create table if not exists public.customer_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text not null,
  phone text,
  phone_normalized text,
  email text,
  address text,
  property_label text,
  rental_start text,
  rental_end text,
  rental_info text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create index if not exists customer_records_user_phone_idx
  on public.customer_records (user_id, phone_normalized);

create index if not exists customer_records_user_provider_idx
  on public.customer_records (user_id, provider);

alter table public.customer_records enable row level security;

drop policy if exists "customer_records_all_own" on public.customer_records;
create policy "customer_records_all_own"
  on public.customer_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Excel onboarding config: which workbook/worksheet + AI column mapping + sync time.
alter table public.property_software_connections
  add column if not exists workbook_id text;
alter table public.property_software_connections
  add column if not exists workbook_name text;
alter table public.property_software_connections
  add column if not exists worksheet_id text;
alter table public.property_software_connections
  add column if not exists column_mapping jsonb;
alter table public.property_software_connections
  add column if not exists last_synced_at timestamptz;
