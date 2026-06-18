-- Call minute quotas per profile (free: 5 min total, pro: 1 h / month)

alter table public.profiles
  add column if not exists call_seconds_used integer not null default 0,
  add column if not exists call_usage_period_start timestamptz not null default now();

-- Backfill from existing calls
update public.profiles p
set call_seconds_used = coalesce(
  (select sum(c.duration_seconds)::int from public.calls c where c.user_id = p.id),
  0
)
where p.plan = 'free';

update public.profiles p
set
  call_seconds_used = coalesce(
    (
      select sum(c.duration_seconds)::int
      from public.calls c
      where c.user_id = p.id
        and c.started_at >= date_trunc('month', now())
    ),
    0
  ),
  call_usage_period_start = date_trunc('month', now())
where p.plan = 'pro';
