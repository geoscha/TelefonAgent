-- Central agent governance: global rules, workflows, versioning, tenant overrides

create table if not exists public.agent_governance_config (
  id int primary key default 1 check (id = 1),
  global_rules jsonb not null default '{}'::jsonb,
  tone_vocabulary jsonb not null default '{}'::jsonb,
  channel_settings jsonb not null default '{}'::jsonb,
  current_version int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.agent_governance_config enable row level security;

create table if not exists public.agent_governance_workflows (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  trigger_intent text not null default '',
  goals jsonb not null default '[]'::jsonb,
  required_slots jsonb not null default '[]'::jsonb,
  optional_slots jsonb not null default '[]'::jsonb,
  business_rules text not null default '',
  voice_variant jsonb not null default '{}'::jsonb,
  message_variant jsonb not null default '{}'::jsonb,
  fallback text not null default '',
  output_schema jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  enabled_globally boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_governance_workflows enable row level security;

create table if not exists public.agent_governance_versions (
  id uuid primary key default gen_random_uuid(),
  version_number int not null unique,
  config_snapshot jsonb not null,
  compiled jsonb not null,
  notes text,
  published_at timestamptz not null default now()
);

alter table public.agent_governance_versions enable row level security;

create table if not exists public.agent_governance_workflow_tenants (
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id uuid not null references public.agent_governance_workflows(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, workflow_id)
);

alter table public.agent_governance_workflow_tenants enable row level security;

create index if not exists agent_governance_workflow_tenants_user_idx
  on public.agent_governance_workflow_tenants (user_id);

create index if not exists agent_governance_versions_number_idx
  on public.agent_governance_versions (version_number desc);
