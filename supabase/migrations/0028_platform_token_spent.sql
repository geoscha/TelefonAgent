-- Platform-wide cumulative token spend (survives user deletion).

create table if not exists public.platform_metrics (
  id text primary key default 'global',
  total_tokens_spent bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.platform_metrics enable row level security;

insert into public.platform_metrics (id, total_tokens_spent)
select
  'global',
  coalesce(sum(abs(amount))::bigint, 0)
from public.token_transactions
where amount < 0
on conflict (id) do update
set total_tokens_spent = greatest(
  public.platform_metrics.total_tokens_spent,
  excluded.total_tokens_spent
);

create or replace function public.increment_platform_tokens_spent(p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_amount <= 0 then
    return;
  end if;

  insert into public.platform_metrics (id, total_tokens_spent)
  values ('global', p_amount)
  on conflict (id) do update
  set total_tokens_spent = public.platform_metrics.total_tokens_spent + excluded.total_tokens_spent,
      updated_at = now();
end;
$$;

drop function if exists public.debit_user_tokens(uuid, integer, text, text, jsonb);

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

  perform public.increment_platform_tokens_spent(p_amount);

  return jsonb_build_object('ok', true, 'balance', v_new, 'duplicate', false);
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'balance', coalesce(v_current, 0), 'duplicate', true);
end;
$$;

revoke all on function public.increment_platform_tokens_spent(integer) from public;
grant execute on function public.increment_platform_tokens_spent(integer) to service_role;

revoke all on function public.debit_user_tokens(uuid, integer, text, text, jsonb) from public;
grant execute on function public.debit_user_tokens(uuid, integer, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
