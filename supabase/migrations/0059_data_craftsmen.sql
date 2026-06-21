-- Daten tab: distinguish Mieter/Kunden vs Handwerker in the same mirror table,
-- optional second worksheet mapping, and ElevenLabs KB text for craftsmen.

alter table public.customer_records
  add column if not exists record_type text not null default 'customer'
    check (record_type in ('customer', 'craftsman'));

alter table public.customer_records
  add column if not exists trade text;

create index if not exists customer_records_user_type_idx
  on public.customer_records (user_id, record_type);

alter table public.property_software_connections
  add column if not exists craftsman_worksheet_id text,
  add column if not exists craftsman_worksheet_name text,
  add column if not exists craftsman_column_mapping jsonb,
  add column if not exists craftsmen_kb_text text,
  add column if not exists craftsmen_elevenlabs_doc_id text,
  add column if not exists craftsmen_elevenlabs_doc_name text;
