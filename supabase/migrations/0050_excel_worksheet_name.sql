alter table public.property_software_connections
  add column if not exists worksheet_name text;
