-- New users start with 0 tokens (no welcome bonus).
alter table public.profiles
  alter column token_balance set default 0;
