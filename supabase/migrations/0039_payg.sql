alter table public.profiles
  add column if not exists payg_enabled boolean not null default false,
  add column if not exists stripe_payment_method_id text;

create or replace function public.profiles_sanitize_client_updates()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.token_balance := old.token_balance;
    new.phone_paused_at := old.phone_paused_at;
    new.last_token_topup_at := old.last_token_topup_at;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_payment_method_id := old.stripe_payment_method_id;
    new.payg_enabled := old.payg_enabled;
  end if;
  return new;
end;
$$;
