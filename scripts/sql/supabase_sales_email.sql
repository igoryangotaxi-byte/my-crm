-- Sales Operation — Phase 10: email integration (templates + message log).
-- Additive: two dedicated tables, no changes to existing tables.

-- 1) Reusable email templates (managed in Sales Operation → Settings).
create table if not exists public.sales_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  locale text not null default 'en' check (locale in ('en', 'he')),
  is_active boolean not null default true,
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_email_templates_active_idx
  on public.sales_email_templates (is_active, name);

-- 2) Per-lead email thread (outbound sent/failed/logged + inbound received).
create table if not exists public.sales_email_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  status text not null default 'logged' check (
    status in ('sent', 'failed', 'logged', 'received')
  ),
  from_address text null,
  to_address text null,
  cc_address text null,
  subject text not null default '',
  body text not null default '',
  provider text null,
  provider_message_id text null,
  error text null,
  template_id uuid null references public.sales_email_templates (id) on delete set null,
  actor_user_id text null,
  actor_name text null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_email_messages_lead_idx
  on public.sales_email_messages (lead_id, occurred_at desc);
