-- Fix blocked token debits: remove guard trigger, fix welcome grant, ensure RPC grants.

drop trigger if exists guard_profile_token_balance on public.profiles;

create or replace function public.grant_welcome_tokens(
  p_user_id uuid,
  p_amount integer default 2000
)
returns table(granted boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_result record;
begin
  perform public.set_token_billing_bypass();

  if p_amount <= 0 then
    select coalesce(token_balance, 0)
      into v_balance
      from public.profiles
     where id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return query select false, 0;
    return;
  end if;

  if exists (
    select 1
    from public.token_transactions t
    where t.user_id = p_user_id
      and t.source = 'welcome_bonus'
      and t.reference_id = 'welcome:' || p_user_id::text
  ) then
    select coalesce(token_balance, 0)
      into v_balance
      from public.profiles
     where id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  select coalesce(token_balance, 0)
    into v_balance
    from public.profiles
   where id = p_user_id
   for update;

  if v_balance >= p_amount then
    insert into public.token_transactions (
      user_id,
      amount,
      balance_after,
      source,
      reference_id,
      metadata
    )
    values (
      p_user_id,
      p_amount,
      v_balance,
      'welcome_bonus',
      'welcome:' || p_user_id::text,
      '{}'::jsonb
    );

    return query select false, v_balance;
    return;
  end if;

  select *
    into v_result
    from public.credit_user_tokens(
      p_user_id,
      p_amount,
      'welcome_bonus',
      'welcome:' || p_user_id::text,
      '{}'::jsonb,
      false
    );

  if coalesce(v_result.success, false) then
    return query select not coalesce(v_result.duplicate_credit, false), v_result.new_balance;
    return;
  end if;

  select coalesce(token_balance, 0)
    into v_balance
    from public.profiles
   where id = p_user_id;
  return query select false, coalesce(v_balance, 0);
exception
  when unique_violation then
    select coalesce(token_balance, 0)
      into v_balance
      from public.profiles
     where id = p_user_id;
    return query select false, coalesce(v_balance, 0);
end;
$$;

create or replace function public.debit_user_tokens(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(success boolean, new_balance integer, duplicate_charge boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_new integer;
begin
  perform public.set_token_billing_bypass();

  if p_amount <= 0 then
    select coalesce(token_balance, 0)
      into v_current
      from public.profiles
     where id = p_user_id;
    return query select true, coalesce(v_current, 0), false;
    return;
  end if;

  if p_reference_id is not null then
    if exists (
      select 1
      from public.token_transactions t
      where t.user_id = p_user_id
        and t.source = p_source
        and t.reference_id = p_reference_id
    ) then
      select coalesce(token_balance, 0)
        into v_current
        from public.profiles
       where id = p_user_id;
      return query select true, coalesce(v_current, 0), true;
      return;
    end if;
  end if;

  v_current := null;

  select token_balance
    into v_current
    from public.profiles
   where id = p_user_id
   for update;

  if not found or v_current is null then
    return query select false, 0, false;
    return;
  end if;

  if v_current < p_amount then
    return query select false, v_current, false;
    return;
  end if;

  v_new := v_current - p_amount;

  update public.profiles
     set token_balance = v_new,
         updated_at = now()
   where id = p_user_id;

  insert into public.token_transactions (
    user_id,
    amount,
    balance_after,
    source,
    reference_id,
    metadata
  )
  values (
    p_user_id,
    -p_amount,
    v_new,
    p_source,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select true, v_new, false;
exception
  when unique_violation then
    select coalesce(token_balance, 0)
      into v_current
      from public.profiles
     where id = p_user_id;
    return query select true, coalesce(v_current, 0), true;
end;
$$;

grant usage on schema public to service_role;
grant execute on function public.debit_user_tokens(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.credit_user_tokens(uuid, integer, text, text, jsonb, boolean) to service_role;
grant execute on function public.grant_welcome_tokens(uuid, integer) to service_role;
