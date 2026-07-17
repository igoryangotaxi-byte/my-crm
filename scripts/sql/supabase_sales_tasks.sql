-- Sales Operation — Phase 4: tasks / next-step activities per lead.
-- Additive: dedicated task table, no changes to existing tables.

create table if not exists public.sales_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  title text not null,
  description text null,
  task_type text null check (
    task_type is null
    or task_type in ('call', 'email', 'meeting', 'whatsapp', 'todo', 'other')
  ),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_at timestamptz null,
  assigned_to_user_id text null,
  assigned_to_name text null,
  completed_at timestamptz null,
  completed_by_user_id text null,
  completed_by_name text null,
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_tasks_lead_id_idx
  on public.sales_tasks (lead_id, created_at desc);

create index if not exists sales_tasks_assigned_idx
  on public.sales_tasks (assigned_to_user_id, status, due_at);

create index if not exists sales_tasks_status_due_idx
  on public.sales_tasks (status, due_at);
