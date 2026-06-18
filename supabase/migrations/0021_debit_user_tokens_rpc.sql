-- Atomic token debit (profile + ledger) for reliable phone billing.

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
  if p_amount <= 0 then
    select coalesce(token_balance, 0)
      into v_current
      from public.profiles
     where id = p_user_id;
    return query select true, coalesce(v_current, 0), false;
    return;
  end if;

  if p_reference_id is not null then
    select coalesce(token_balance, 0)
      into v_current
      from public.profiles
     where id = p_user_id;

    if exists (
      select 1
      from public.token_transactions t
      where t.user_id = p_user_id
        and t.source = p_source
        and t.reference_id = p_reference_id
    ) then
      return query select true, coalesce(v_current, 0), true;
      return;
    end if;
  end if;

  select token_balance
    into v_current
    from public.profiles
   where id = p_user_id
   for update;

  if v_current is null or v_current < p_amount then
    return query select false, coalesce(v_current, 0), false;
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

revoke all on function public.debit_user_tokens(uuid, integer, text, text, jsonb) from public;
grant execute on function public.debit_user_tokens(uuid, integer, text, text, jsonb) to service_role;
