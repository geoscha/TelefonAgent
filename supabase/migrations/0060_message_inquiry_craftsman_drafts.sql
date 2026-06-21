-- Outbound craftsman email drafts for damage inquiries (sent alongside customer reply).

alter table public.message_inquiries
  add column if not exists craftsman_drafts jsonb not null default '[]'::jsonb;
