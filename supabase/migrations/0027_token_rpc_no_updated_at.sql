-- Fix token RPCs: profiles has no updated_at column (see 0001_init.sql).

drop function if exists public.debit_user_tokens(uuid, integer, text, text, jsonb);
drop function if exists public.credit_user_tokens(uuid, integer, text, text, jsonb, boolean);
drop function if exists public.grant_welcome_tokens(uuid, integer);

create or replace function public.debit_user_tokens(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_current integer;
  v_new integer;
begin
  if p_amount <= 0 then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_current, 0), 'duplicate', false);
  end if;

  if p_reference_id is not null and exists (
    select 1 from public.token_transactions
    where user_id = p_user_id and source = p_source and reference_id = p_reference_id
  ) then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_current, 0), 'duplicate', true);
  end if;

  select token_balance into v_current from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'balance', 0, 'error', 'profile_not_found');
  end if;

  if v_current < p_amount then
    return jsonb_build_object('ok', false, 'balance', v_current, 'error', 'insufficient');
  end if;

  v_new := v_current - p_amount;

  update public.profiles set token_balance = v_new where id = p_user_id;

  insert into public.token_transactions (user_id, amount, balance_after, source, reference_id, metadata)
  values (p_user_id, -p_amount, v_new, p_source, p_reference_id, coalesce(p_metadata, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'balance', v_new, 'duplicate', false);
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_current, 0), 'duplicate', true);
end;
$$;

create or replace function public.credit_user_tokens(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_reference_id text,
  p_metadata jsonb default '{}'::jsonb,
  p_touch_topup boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_current integer;
  v_new integer;
begin
  if p_amount <= 0 then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', false, 'balance', coalesce(v_current, 0));
  end if;

  if exists (
    select 1 from public.token_transactions
    where user_id = p_user_id and source = p_source and reference_id = p_reference_id
  ) then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_current, 0), 'duplicate', true);
  end if;

  select token_balance into v_current from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'balance', 0, 'error', 'profile_not_found');
  end if;

  v_new := v_current + p_amount;

  update public.profiles
     set token_balance = v_new,
         last_token_topup_at = case when p_touch_topup then now() else last_token_topup_at end
   where id = p_user_id;

  insert into public.token_transactions (user_id, amount, balance_after, source, reference_id, metadata)
  values (p_user_id, p_amount, v_new, p_source, p_reference_id, coalesce(p_metadata, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'balance', v_new, 'duplicate', false);
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_current, 0), 'duplicate', true);
end;
$$;

create or replace function public.grant_welcome_tokens(
  p_user_id uuid,
  p_amount integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_balance integer;
  v_ref text;
  v_credit jsonb;
begin
  v_ref := 'welcome:' || p_user_id::text;

  if p_amount <= 0 or not exists (select 1 from public.profiles where id = p_user_id) then
    select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_balance, 0), 'granted', false);
  end if;

  if exists (
    select 1 from public.token_transactions
    where user_id = p_user_id and source = 'welcome_bonus' and reference_id = v_ref
  ) then
    select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_balance, 0), 'granted', false);
  end if;

  select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id for update;

  if v_balance >= p_amount then
    insert into public.token_transactions (user_id, amount, balance_after, source, reference_id, metadata)
    values (p_user_id, p_amount, v_balance, 'welcome_bonus', v_ref, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'balance', v_balance, 'granted', false);
  end if;

  v_credit := public.credit_user_tokens(p_user_id, p_amount, 'welcome_bonus', v_ref, '{}'::jsonb, false);
  return v_credit || jsonb_build_object('granted', coalesce((v_credit->>'ok')::boolean, false));
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_balance, 0), 'granted', false);
end;
$$;

revoke all on function public.debit_user_tokens(uuid, integer, text, text, jsonb) from public;
revoke all on function public.credit_user_tokens(uuid, integer, text, text, jsonb, boolean) from public;
revoke all on function public.grant_welcome_tokens(uuid, integer) from public;

grant execute on function public.debit_user_tokens(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.credit_user_tokens(uuid, integer, text, text, jsonb, boolean) to service_role;
grant execute on function public.grant_welcome_tokens(uuid, integer) to service_role;

notify pgrst, 'reload schema';
