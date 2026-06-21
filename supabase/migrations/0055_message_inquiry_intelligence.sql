-- Richer AI analysis for message inquiries: category, urgency, confidence and a
-- structured context dossier (customer + appointment history + past concerns).

alter table public.message_inquiries
  add column if not exists category text,
  add column if not exists urgency text,
  add column if not exists confidence real,
  add column if not exists context jsonb not null default '{}'::jsonb;
