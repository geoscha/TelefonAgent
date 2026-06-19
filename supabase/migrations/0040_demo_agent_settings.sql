-- Admin-managed landing demo agent: voice preset, greeting, extra context.

alter table public.admin_config
  add column if not exists demo_voice_preset text,
  add column if not exists demo_greeting text,
  add column if not exists demo_context text;

update public.admin_config
set demo_voice_preset = 'female-de'
where id = 1
  and demo_voice_preset is null;
