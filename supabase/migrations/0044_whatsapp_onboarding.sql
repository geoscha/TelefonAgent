-- WhatsApp onboarding: account number, optional Linker phone link, verification

alter table public.whatsapp_connections
  add column if not exists whatsapp_number text,
  add column if not exists account_registered boolean not null default false,
  add column if not exists onboarding_status text not null default 'connected'
    check (onboarding_status in ('pending_verification', 'connected')),
  add column if not exists verification_code_hash text,
  add column if not exists verification_expires_at timestamptz;

update public.whatsapp_connections wc
set whatsapp_number = upn.phone_number
from public.user_phone_numbers upn
where wc.phone_number_id = upn.id
  and wc.whatsapp_number is null;

delete from public.whatsapp_connections
where whatsapp_number is null;

alter table public.whatsapp_connections
  alter column whatsapp_number set not null;

alter table public.whatsapp_connections
  alter column phone_number_id drop not null;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_user_id_phone_number_id_key;

create unique index if not exists whatsapp_connections_user_whatsapp_number_idx
  on public.whatsapp_connections (user_id, whatsapp_number)
  where whatsapp_number is not null;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_user_whatsapp_number_key;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_user_whatsapp_number_key
  unique (user_id, whatsapp_number);

create unique index if not exists whatsapp_connections_whatsapp_number_active_idx
  on public.whatsapp_connections (whatsapp_number)
  where connected = true and whatsapp_number is not null;
