-- Scheduled phone release + pool reuse tracking.

alter table public.user_phone_numbers
  add column if not exists release_at timestamptz;

alter table public.forwarding_number_pool
  add column if not exists times_assigned integer not null default 0,
  add column if not exists last_released_at timestamptz;

update public.forwarding_number_pool p
set times_assigned = greatest(p.times_assigned, sub.cnt)
from (
  select phone_number, count(distinct user_id)::int as cnt
  from public.user_phone_numbers
  where source = 'pool'
  group by phone_number
) sub
where p.phone_number = sub.phone_number;

create index if not exists user_phone_numbers_release_at_idx
  on public.user_phone_numbers (release_at)
  where release_at is not null;
