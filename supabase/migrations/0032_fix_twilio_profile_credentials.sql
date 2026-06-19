-- Remove invalid Twilio profiles and prevent empty credentials.

delete from public.admin_twilio_accounts
where length(trim(account_sid)) = 0
   or length(trim(auth_token)) = 0
   or trim(account_sid) !~ '^AC[0-9a-fA-F]{32}$';

alter table public.admin_twilio_accounts
  drop constraint if exists admin_twilio_accounts_sid_not_empty;

alter table public.admin_twilio_accounts
  add constraint admin_twilio_accounts_sid_not_empty
  check (length(trim(account_sid)) > 0);

alter table public.admin_twilio_accounts
  drop constraint if exists admin_twilio_accounts_token_not_empty;

alter table public.admin_twilio_accounts
  add constraint admin_twilio_accounts_token_not_empty
  check (length(trim(auth_token)) > 0);

alter table public.admin_twilio_accounts
  drop constraint if exists admin_twilio_accounts_sid_format;

alter table public.admin_twilio_accounts
  add constraint admin_twilio_accounts_sid_format
  check (trim(account_sid) ~ '^AC[0-9a-fA-F]{32}$');
