-- Complete token billing (idempotent). Run once in Supabase SQL editor.

-- ── Schema (safe if already applied) ────────────────────────────────────────

alter table public.profiles
  add column if not exists token_balance integer not null default 0,
  add column if not exists phone_paused_at timestamptz,
  add column if not exists last_token_topup_at timestamptz;

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  balance_after integer not null,
  source text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists token_transactions_idempotent_idx
  on public.token_transactions (user_id, source, reference_id)
  where reference_id is not null;

create index if not exists token_transactions_user_created_idx
  on public.token_transactions (user_id, created_at desc);

alter table public.token_transactions enable row level security;

drop policy if exists "token_transactions_select_own" on public.token_transactions;
create policy "token_transactions_select_own" on public.token_transactions
  for select using (auth.uid() = user_id);

-- ── Remove old guard that blocked service-role JS updates ───────────────────

drop trigger if exists guard_profile_token_balance on public.profiles;
drop function if exists public.guard_profile_token_balance();

-- Authenticated users cannot change token_balance (anti-cheat).
create or replace function public.profiles_protect_token_balance()
returns trigger
language plpgsql
as $$
begin
  if NEW.token_balance is distinct from OLD.token_balance then
    if current_setting('cura.token_billing', true) = '1' then
      return NEW;
    end if;
    if coalesce(auth.jwt()->>'role', auth.role()::text, '') = 'service_role' then
      return NEW;
    end if;
    NEW.token_balance := OLD.token_balance;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_token_balance on public.profiles;
create trigger profiles_protect_token_balance
  before update on public.profiles
  for each row
  execute function public.profiles_protect_token_balance();

-- ── Billing RPC helpers ─────────────────────────────────────────────────────

create or replace function public.set_token_billing_bypass()
returns void
language plpgsql
as $$
begin
  perform set_config('cura.token_billing', '1', true);
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
returns table(success boolean, new_balance integer, duplicate_credit boolean)
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
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return query select true, coalesce(v_current, 0), false;
    return;
  end if;

  if exists (
    select 1 from public.token_transactions t
    where t.user_id = p_user_id and t.source = p_source and t.reference_id = p_reference_id
  ) then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return query select true, coalesce(v_current, 0), true;
    return;
  end if;

  select token_balance into v_current from public.profiles where id = p_user_id for update;
  if not found then
    return query select false, 0, false;
    return;
  end if;

  v_new := v_current + p_amount;

  update public.profiles
     set token_balance = v_new,
         last_token_topup_at = case when p_touch_topup then now() else last_token_topup_at end,
         updated_at = now()
   where id = p_user_id;

  insert into public.token_transactions (user_id, amount, balance_after, source, reference_id, metadata)
  values (p_user_id, p_amount, v_new, p_source, p_reference_id, coalesce(p_metadata, '{}'::jsonb));

  return query select true, v_new, false;
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return query select true, coalesce(v_current, 0), true;
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
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return query select true, coalesce(v_current, 0), false;
    return;
  end if;

  if p_reference_id is not null and exists (
    select 1 from public.token_transactions t
    where t.user_id = p_user_id and t.source = p_source and t.reference_id = p_reference_id
  ) then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return query select true, coalesce(v_current, 0), true;
    return;
  end if;

  select token_balance into v_current from public.profiles where id = p_user_id for update;
  if not found then
    return query select false, 0, false;
    return;
  end if;

  if v_current < p_amount then
    return query select false, v_current, false;
    return;
  end if;

  v_new := v_current - p_amount;

  update public.profiles set token_balance = v_new, updated_at = now() where id = p_user_id;

  insert into public.token_transactions (user_id, amount, balance_after, source, reference_id, metadata)
  values (p_user_id, -p_amount, v_new, p_source, p_reference_id, coalesce(p_metadata, '{}'::jsonb));

  return query select true, v_new, false;
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_current from public.profiles where id = p_user_id;
    return query select true, coalesce(v_current, 0), true;
end;
$$;

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
  v_ref text;
begin
  perform public.set_token_billing_bypass();
  v_ref := 'welcome:' || p_user_id::text;

  if p_amount <= 0 or not exists (select 1 from public.profiles where id = p_user_id) then
    select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  if exists (
    select 1 from public.token_transactions t
    where t.user_id = p_user_id and t.source = 'welcome_bonus' and t.reference_id = v_ref
  ) then
    select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id for update;

  if v_balance >= p_amount then
    insert into public.token_transactions (user_id, amount, balance_after, source, reference_id, metadata)
    values (p_user_id, p_amount, v_balance, 'welcome_bonus', v_ref, '{}'::jsonb);
    return query select false, v_balance;
    return;
  end if;

  select * into v_result from public.credit_user_tokens(
    p_user_id, p_amount, 'welcome_bonus', v_ref, '{}'::jsonb, false
  );

  if coalesce(v_result.success, false) then
    return query select not coalesce(v_result.duplicate_credit, false), v_result.new_balance;
    return;
  end if;

  select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
  return query select false, coalesce(v_balance, 0);
exception
  when unique_violation then
    select coalesce(token_balance, 0) into v_balance from public.profiles where id = p_user_id;
    return query select false, coalesce(v_balance, 0);
end;
$$;

revoke all on function public.set_token_billing_bypass() from public;
revoke all on function public.profiles_protect_token_balance() from public;
revoke all on function public.credit_user_tokens(uuid, integer, text, text, jsonb, boolean) from public;
revoke all on function public.debit_user_tokens(uuid, integer, text, text, jsonb) from public;
revoke all on function public.grant_welcome_tokens(uuid, integer) from public;

grant usage on schema public to service_role;
grant execute on function public.credit_user_tokens(uuid, integer, text, text, jsonb, boolean) to service_role;
grant execute on function public.debit_user_tokens(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.grant_welcome_tokens(uuid, integer) to service_role;

notify pgrst, 'reload schema';
