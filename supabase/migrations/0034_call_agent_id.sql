-- Attribute calls to ElevenLabs agents for per-agent usage stats.
alter table public.calls
  add column if not exists agent_id text;

create index if not exists calls_user_agent_idx
  on public.calls (user_id, agent_id)
  where agent_id is not null;
