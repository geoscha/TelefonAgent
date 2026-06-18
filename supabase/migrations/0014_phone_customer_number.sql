-- ── Customer (source) number per user phone row ─────────────────────────────

alter table public.user_phone_numbers
  add column if not exists customer_number text;
