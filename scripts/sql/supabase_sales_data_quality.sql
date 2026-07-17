-- Sales Operation — Phase 9: data quality.
-- Additive: audit log table + soft-archive columns on leads. Non-breaking.

-- 1) Full audit log (append-only). Best-effort writes from app code.
create table if not exists public.sales_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_user_id text null,
  actor_name text null,
  summary text null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_audit_log_entity_idx
  on public.sales_audit_log (entity_type, entity_id, created_at desc);

create index if not exists sales_audit_log_created_idx
  on public.sales_audit_log (created_at desc);

-- 2) Soft archive for leads (keeps history; hidden from active board by default).
alter table public.sales_leads
  add column if not exists is_archived boolean not null default false;
alter table public.sales_leads
  add column if not exists archived_at timestamptz null;
alter table public.sales_leads
  add column if not exists archived_by_user_id text null;
alter table public.sales_leads
  add column if not exists archived_by_name text null;

create index if not exists sales_leads_is_archived_idx
  on public.sales_leads (is_archived);
