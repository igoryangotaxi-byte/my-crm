-- Phase 1 — Sales Operation foundation: configurable pipeline stages, segments,
-- and richer lead/deal fields. All additive & idempotent.

-- Configurable pipeline stages -------------------------------------------------
create table if not exists public.sales_pipeline_stages (
  key text primary key,
  label text not null,
  order_index integer not null default 0,
  probability integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  color text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_pipeline_stages_order_idx
  on public.sales_pipeline_stages (order_index);

insert into public.sales_pipeline_stages
  (key, label, order_index, probability, is_won, is_lost, is_terminal, color)
values
  ('new',           'New',           0, 10,  false, false, false, '#3b82f6'),
  ('in_progress',   'In Progress',   1, 30,  false, false, false, '#64748b'),
  ('proposal_sent', 'Proposal Sent', 2, 50,  false, false, false, '#eab308'),
  ('negotiation',   'Negotiation',   3, 70,  false, false, false, '#f59e0b'),
  ('signed',        'Signed',        4, 100, true,  false, true,  '#22c55e'),
  ('rejected',      'Rejected',      5, 0,   false, true,  true,  '#ef4444')
on conflict (key) do nothing;

-- Sales segments ---------------------------------------------------------------
create table if not exists public.sales_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_segments_name_uidx
  on public.sales_segments (lower(name));
create index if not exists sales_segments_order_idx
  on public.sales_segments (order_index);

insert into public.sales_segments (name, order_index)
values
  ('Transportation', 0),
  ('Logistics', 1),
  ('Hospitality', 2),
  ('Healthcare', 3),
  ('Retail', 4),
  ('Construction', 5),
  ('Technology', 6),
  ('Finance', 7),
  ('Government', 8),
  ('Education', 9),
  ('Other', 10)
on conflict do nothing;

-- Richer lead / deal fields ----------------------------------------------------
alter table public.sales_leads add column if not exists legal_name text null;
alter table public.sales_leads add column if not exists company_reg_number text null;
alter table public.sales_leads add column if not exists website text null;
alter table public.sales_leads add column if not exists segment_id text null;
alter table public.sales_leads add column if not exists sub_segment text null;
alter table public.sales_leads add column if not exists employees_count integer null;
alter table public.sales_leads add column if not exists estimated_monthly_potential numeric null;
alter table public.sales_leads add column if not exists estimated_monthly_trips integer null;
alter table public.sales_leads add column if not exists expected_close_date date null;
alter table public.sales_leads add column if not exists probability_override integer null;
alter table public.sales_leads add column if not exists client_address text null;
alter table public.sales_leads add column if not exists general_notes text null;

create index if not exists sales_leads_segment_id_idx on public.sales_leads (segment_id);
