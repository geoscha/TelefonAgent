-- Excel/CSV/Google-Sheet onboarding: header-name column mapping, E.164 phone
-- uniqueness for fast caller lookup, new target fields and per-source sync
-- status (import_sources parity) + a private storage bucket for uploads.

-- 1) New target field on the contact mirror (raw jsonb already exists).
alter table public.customer_records
  add column if not exists unit text;

-- 2) De-duplicate existing rows by (user_id, phone_normalized) BEFORE adding the
--    unique index. Keep the most recently synced row; null the older duplicates'
--    normalized phone so the index can be created without data loss.
update public.customer_records cr
set phone_normalized = null
where cr.phone_normalized is not null
  and exists (
    select 1
    from public.customer_records other
    where other.user_id = cr.user_id
      and other.phone_normalized = cr.phone_normalized
      and (
        other.synced_at > cr.synced_at
        or (other.synced_at = cr.synced_at and other.id < cr.id)
      )
  );

-- 3) Fast, unique caller lookup: one contact per (tenant, E.164 phone).
create unique index if not exists customer_records_user_phone_uniq
  on public.customer_records (user_id, phone_normalized)
  where phone_normalized is not null;

-- 4) Source configuration / status on the connection row (import_sources parity).
alter table public.property_software_connections
  add column if not exists file_ref text,
  add column if not exists file_name text,
  add column if not exists gsheet_url text,
  add column if not exists gsheet_gid text,
  add column if not exists sync_status text,
  add column if not exists sync_error text;

-- 5) Private storage bucket for uploaded import files (.xlsx/.csv).
insert into storage.buckets (id, name, public)
values ('customer-imports', 'customer-imports', false)
on conflict (id) do nothing;

-- Owner-scoped access (server routes also use the service role, which bypasses
-- RLS; these policies are defense-in-depth for the authenticated client).
drop policy if exists "customer_imports_owner_rw" on storage.objects;
create policy "customer_imports_owner_rw"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'customer-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'customer-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
