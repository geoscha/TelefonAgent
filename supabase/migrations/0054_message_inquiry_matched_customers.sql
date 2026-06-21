-- Store customer-database matches found during message inquiry analysis.

alter table public.message_inquiries
  add column if not exists matched_customers jsonb not null default '[]'::jsonb;
