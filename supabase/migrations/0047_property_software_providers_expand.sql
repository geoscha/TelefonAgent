-- Extend property software integrations with new providers + OAuth tokens (Excel).

alter table public.property_software_connections
  drop constraint if exists property_software_connections_provider_check;

alter table public.property_software_connections
  add constraint property_software_connections_provider_check
  check (
    provider in (
      'immotop2',
      'abacus',
      'fairwalter',
      'garaio_rem',
      'rimo_r5',
      'excel'
    )
  );

alter table public.property_software_connections
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists expires_at bigint;
