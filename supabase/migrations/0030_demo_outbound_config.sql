-- Dedicated landing-page demo outbound number (admin settings, not user pool).

alter table public.admin_config
  add column if not exists demo_outbound_phone_number text,
  add column if not exists demo_outbound_elevenlabs_phone_id text;

update public.admin_config
set demo_outbound_phone_number = '+41445054632'
where id = 1
  and demo_outbound_phone_number is null;
