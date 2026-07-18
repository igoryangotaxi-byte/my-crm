-- Sales Operation — KPI / Goals: admin-defined performance targets per manager.
-- Additive: new standalone table, no changes to existing tables. Actuals are
-- computed from existing data (pipeline + B2B Overview); this table only stores
-- the targets an admin assigns.

create table if not exists public.sales_kpi_targets (
  id uuid primary key default gen_random_uuid(),
  manager_user_id text not null,
  metric_key text not null check (
    metric_key in (
      'signed_count', 'conversion_pct', 'leads_worked', 'activities_logged',
      'tasks_completed', 'avg_cycle_days', 'avg_response_hours',
      'weighted_forecast', 'gmv', 'trips'
    )
  ),
  period_type text not null check (period_type in ('month', 'quarter')),
  period_start date not null,
  target_value numeric not null default 0,
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_kpi_targets_unique_idx
  on public.sales_kpi_targets (manager_user_id, metric_key, period_type, period_start);

create index if not exists sales_kpi_targets_period_idx
  on public.sales_kpi_targets (period_type, period_start);
