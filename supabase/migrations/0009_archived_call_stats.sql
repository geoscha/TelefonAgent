-- Snapshot of call stats when a free user's agent is suspended (quota exhausted).

alter table public.app_settings
  add column if not exists archived_call_stats jsonb not null default '[]'::jsonb;
