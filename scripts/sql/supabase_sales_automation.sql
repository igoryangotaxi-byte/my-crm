-- Sales Operation Automation: workflows + run logs + lead assigned manager

alter table public.sales_leads
  add column if not exists assigned_manager_user_id text null;

alter table public.sales_leads
  add column if not exists assigned_manager_name text null;

create index if not exists sales_leads_assigned_manager_user_id_idx
  on public.sales_leads (assigned_manager_user_id);

create table if not exists public.sales_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default false,
  graph jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  round_robin_state jsonb not null default '{}'::jsonb,
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_automations_enabled_idx
  on public.sales_automations (enabled);

create table if not exists public.sales_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.sales_automations (id) on delete cascade,
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  trigger_from_status text null,
  trigger_to_status text not null,
  status text not null check (status in ('ok', 'partial', 'error')),
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_automation_runs_automation_id_idx
  on public.sales_automation_runs (automation_id, created_at desc);

create index if not exists sales_automation_runs_lead_id_idx
  on public.sales_automation_runs (lead_id, created_at desc);
