-- Track when a free user's ElevenLabs agent was removed due to quota exhaustion.

alter table public.app_settings
  add column if not exists agent_suspended_at timestamptz;
