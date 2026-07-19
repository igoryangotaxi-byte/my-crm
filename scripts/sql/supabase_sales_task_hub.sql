-- Sales Operation — Task hub: summary, follow-up lineage, append-only events.

alter table public.sales_tasks
  add column if not exists result_summary text null;

alter table public.sales_tasks
  add column if not exists parent_task_id uuid null references public.sales_tasks (id) on delete set null;

create index if not exists sales_tasks_created_by_idx
  on public.sales_tasks (created_by_user_id, status, due_at);

create index if not exists sales_tasks_parent_idx
  on public.sales_tasks (parent_task_id);

create table if not exists public.sales_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.sales_tasks (id) on delete cascade,
  lead_id uuid null,
  event_type text not null check (
    event_type in (
      'created',
      'status_changed',
      'reassigned',
      'due_changed',
      'summary_updated',
      'follow_up_created',
      'comment',
      'updated'
    )
  ),
  body text null,
  changes jsonb null,
  actor_user_id text null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists sales_task_events_task_idx
  on public.sales_task_events (task_id, created_at desc);
