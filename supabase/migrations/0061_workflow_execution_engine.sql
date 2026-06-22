-- Workflow Execution Engine: structured definitions, per-workflow versions,
-- runtime sessions, cases with audit log, test cases, tenant canary flag.

create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  governance_workflow_id uuid not null references public.agent_governance_workflows (id) on delete cascade,
  slug text not null unique,
  definition jsonb not null default '{}'::jsonb,
  current_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_definitions_governance_idx
  on public.workflow_definitions (governance_workflow_id);

alter table public.workflow_definitions enable row level security;

create table if not exists public.workflow_definition_versions (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.workflow_definitions (id) on delete cascade,
  version_number int not null,
  definition_snapshot jsonb not null,
  compiled jsonb not null default '{}'::jsonb,
  notes text,
  published_at timestamptz not null default now(),
  unique (definition_id, version_number)
);

create index if not exists workflow_definition_versions_def_idx
  on public.workflow_definition_versions (definition_id, version_number desc);

alter table public.workflow_definition_versions enable row level security;

create table if not exists public.workflow_test_cases (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.workflow_definitions (id) on delete cascade,
  name text not null,
  channel text not null default 'message',
  input_text text not null,
  expected_slug text,
  expected_slots jsonb not null default '{}'::jsonb,
  forbidden_outputs jsonb not null default '[]'::jsonb,
  must_escalate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_test_cases_def_idx
  on public.workflow_test_cases (definition_id);

alter table public.workflow_test_cases enable row level security;

create table if not exists public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  definition_id uuid references public.workflow_definitions (id) on delete set null,
  workflow_slug text not null,
  workflow_version int not null default 0,
  channel text not null,
  source_ref text,
  agent_id text,
  current_step_id text,
  slots jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  router_confidence numeric,
  router_reason text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workflow_executions_user_status_idx
  on public.workflow_executions (user_id, status, updated_at desc);

create index if not exists workflow_executions_source_idx
  on public.workflow_executions (user_id, source_ref);

alter table public.workflow_executions enable row level security;

create table if not exists public.workflow_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  execution_id uuid references public.workflow_executions (id) on delete set null,
  definition_id uuid references public.workflow_definitions (id) on delete set null,
  workflow_slug text not null,
  workflow_version int not null default 0,
  channel text not null,
  source_ref text,
  status text not null default 'open',
  output jsonb not null default '{}'::jsonb,
  escalated boolean not null default false,
  strict_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists workflow_cases_user_status_idx
  on public.workflow_cases (user_id, status, created_at desc);

create index if not exists workflow_cases_slug_idx
  on public.workflow_cases (workflow_slug, created_at desc);

alter table public.workflow_cases enable row level security;

create table if not exists public.workflow_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.workflow_cases (id) on delete cascade,
  event_type text not null,
  step_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_case_events_case_idx
  on public.workflow_case_events (case_id, created_at);

alter table public.workflow_case_events enable row level security;

create table if not exists public.workflow_engine_tenants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.workflow_engine_tenants enable row level security;

alter table public.message_inquiries
  add column if not exists workflow_case_id uuid references public.workflow_cases (id) on delete set null;

alter table public.calls
  add column if not exists workflow_case_id uuid references public.workflow_cases (id) on delete set null;
