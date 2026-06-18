-- Welcome tokens + monthly phone number billing

alter table public.profiles
  alter column token_balance set default 2000;

alter table public.user_phone_numbers
  add column if not exists assigned_at timestamptz,
  add column if not exists next_billing_at timestamptz;

-- Existing numbers: billing anchor = created_at, first renewal one month later
update public.user_phone_numbers
set
  assigned_at = coalesce(assigned_at, created_at),
  next_billing_at = coalesce(next_billing_at, created_at + interval '1 month')
where assigned_at is null or next_billing_at is null;

-- One-time welcome bonus for users without any token history
insert into public.token_transactions (user_id, amount, balance_after, source, reference_id)
select p.id, 2000, 2000, 'welcome_bonus', 'welcome:' || p.id::text
from public.profiles p
where not exists (
  select 1 from public.token_transactions t where t.user_id = p.id
);

update public.profiles p
set token_balance = 2000, updated_at = now()
where token_balance = 0
  and exists (
    select 1 from public.token_transactions t
    where t.user_id = p.id and t.source = 'welcome_bonus'
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  );

  insert into public.profiles (id, name, email, token_balance)
  values (
    new.id,
    display_name,
    coalesce(new.email, ''),
    2000
  )
  on conflict (id) do nothing;

  insert into public.token_transactions (user_id, amount, balance_after, source, reference_id)
  select new.id, 2000, 2000, 'welcome_bonus', 'welcome:' || new.id::text
  where not exists (
    select 1 from public.token_transactions t
    where t.user_id = new.id and t.reference_id = 'welcome:' || new.id::text
  );

  insert into public.app_settings (user_id, setup_demo_status)
  values (new.id, 'agent')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
