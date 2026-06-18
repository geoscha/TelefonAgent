-- ── Telefonagent onboarding (admin-assigned numbers) ───────────────────────

alter table public.app_settings
  add column if not exists onboarding_phase text
    default 'nummer_anfragen'
    check (onboarding_phase in (
      'nummer_anfragen',
      'nummer_warte',
      'weiterleitung',
      'agent',
      'fertig'
    )),
  add column if not exists forwarding_instructions text,
  add column if not exists agents jsonb not null default '[]'::jsonb;

-- Existing tenants with number + agent keep full access.
update public.app_settings
set onboarding_phase = 'fertig'
where onboarding_phase = 'nummer_anfragen'
  and cura_forwarding_number is not null
  and agent_id is not null;

update public.app_settings
set onboarding_phase = 'weiterleitung'
where onboarding_phase = 'nummer_anfragen'
  and cura_forwarding_number is not null
  and agent_id is null;
