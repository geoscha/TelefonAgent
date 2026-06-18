-- Lifetime customer registry (includes deleted accounts for admin finance KPIs)

create table if not exists public.customer_registry (
  id uuid primary key,
  created_at timestamptz not null,
  deleted_at timestamptz,
  call_seconds_lifetime integer not null default 0
);

create index if not exists customer_registry_deleted_idx
  on public.customer_registry (deleted_at);

-- Backfill from existing profiles
insert into public.customer_registry (id, created_at, deleted_at, call_seconds_lifetime)
select
  p.id,
  p.created_at,
  null,
  coalesce(
    (select sum(c.duration_seconds)::int from public.calls c where c.user_id = p.id),
    0
  )
from public.profiles p
on conflict (id) do nothing;

-- Register new signups
create or replace function public.register_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_registry (id, created_at)
  values (new.id, coalesce(new.created_at, now()))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_register_customer on auth.users;
create trigger on_auth_user_register_customer
  after insert on auth.users
  for each row execute function public.register_customer();
