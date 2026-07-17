-- Sales Operation — Phase 4: unified activity log per lead.
-- Additive: dedicated activity table. The unified feed merges this table with
-- existing notes / status events / tasks, so no historical backfill is required.

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  type text not null check (
    type in (
      'call', 'email', 'meeting', 'whatsapp', 'sms',
      'note', 'task_created', 'task_completed', 'status_changed', 'manual', 'other'
    )
  ),
  title text null,
  body text null,
  meta jsonb not null default '{}'::jsonb,
  actor_user_id text null,
  actor_name text null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_activities_lead_id_idx
  on public.sales_activities (lead_id, occurred_at desc);
