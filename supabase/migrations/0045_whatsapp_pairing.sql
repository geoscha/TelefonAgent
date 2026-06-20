-- WhatsApp pairing for existing profiles + Meta webhook linkage

alter table public.whatsapp_connections
  add column if not exists pairing_code text,
  add column if not exists meta_phone_number_id text;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_onboarding_status_check;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_onboarding_status_check
  check (onboarding_status in ('pending_pairing', 'pending_verification', 'connected'));
