-- Ensure new signups receive 2'000 welcome tokens (DB trigger fallback).

alter table public.profiles
  alter column token_balance set default 2000;

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
  on conflict (id) do update
  set
    token_balance = case
      when public.profiles.token_balance = 0 then 2000
      else public.profiles.token_balance
    end,
    updated_at = now()
  where public.profiles.token_balance = 0;

  insert into public.token_transactions (user_id, amount, balance_after, source, reference_id)
  select
    new.id,
    2000,
    coalesce(
      (select token_balance from public.profiles where id = new.id),
      2000
    ),
    'welcome_bonus',
    'welcome:' || new.id::text
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
