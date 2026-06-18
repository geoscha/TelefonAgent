-- Only phones with a completed initial charge should have billing dates.
-- Migration 0017 backfilled next_billing_at on rows that were never billed.

update public.user_phone_numbers upn
set
  assigned_at = null,
  next_billing_at = null,
  updated_at = now()
where upn.next_billing_at is not null
  and not exists (
    select 1
    from public.token_transactions t
    where t.user_id = upn.user_id
      and t.source = 'phone_monthly'
      and t.reference_id like 'phone_monthly:' || upn.id::text || ':%'
  );
