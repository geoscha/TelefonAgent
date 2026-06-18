-- Prepaid token billing (replaces minute/subscription quota)

alter table public.profiles
  add column if not exists token_balance integer not null default 0,
  add column if not exists phone_paused_at timestamptz,
  add column if not exists last_token_topup_at timestamptz,
  add column if not exists stripe_customer_id text;

alter table public.user_phone_numbers
  add column if not exists paused_at timestamptz;

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
