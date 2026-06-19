alter table public.calendars
  add column if not exists agent_permissions jsonb not null default '{}'::jsonb;
