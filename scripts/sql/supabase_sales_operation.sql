-- Sales Operation CRM: leads pipeline, clients, notes, status history

create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new' check (status in ('new', 'in_progress', 'proposal_sent', 'signed', 'rejected')),
  source text not null default 'manual' check (source in ('manual', 'import', 'meta', 'wordpress')),
  full_name text not null,
  email text null,
  phone text null,
  company_name text null,
  campaign_id text null,
  campaign_name text null,
  ad_id text null,
  ad_name text null,
  form_id text null,
  custom_fields jsonb not null default '{}'::jsonb,
  status_entered_at timestamptz not null default now(),
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_leads_status_idx on public.sales_leads (status);
create index if not exists sales_leads_campaign_name_idx on public.sales_leads (campaign_name);
create index if not exists sales_leads_status_entered_at_idx on public.sales_leads (status_entered_at desc);
create index if not exists sales_leads_created_at_idx on public.sales_leads (created_at desc);

create table if not exists public.sales_lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  author_user_id text null,
  author_name text not null default 'System',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_lead_notes_lead_id_idx on public.sales_lead_notes (lead_id, created_at desc);

create table if not exists public.sales_lead_status_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  from_status text null check (from_status is null or from_status in ('new', 'in_progress', 'proposal_sent', 'signed', 'rejected')),
  to_status text not null check (to_status in ('new', 'in_progress', 'proposal_sent', 'signed', 'rejected')),
  changed_by_user_id text null,
  changed_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists sales_lead_status_events_lead_id_idx
  on public.sales_lead_status_events (lead_id, created_at desc);

create table if not exists public.sales_clients (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.sales_leads (id) on delete restrict,
  full_name text not null,
  email text null,
  phone text null,
  company_name text null,
  campaign_id text null,
  campaign_name text null,
  ad_id text null,
  ad_name text null,
  form_id text null,
  custom_fields jsonb not null default '{}'::jsonb,
  corp_client_id text null,
  pending_sales_manager_user_id text null,
  pending_sales_manager_name text null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_clients_lead_id_idx on public.sales_clients (lead_id);
create index if not exists sales_clients_signed_at_idx on public.sales_clients (signed_at desc);
create index if not exists sales_clients_campaign_name_idx on public.sales_clients (campaign_name);

create index if not exists sales_clients_corp_client_id_idx on public.sales_clients (corp_client_id);

create unique index if not exists sales_clients_corp_client_id_uidx
  on public.sales_clients (corp_client_id)
  where corp_client_id is not null;

create table if not exists public.sales_client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.sales_clients (id) on delete cascade,
  author_user_id text null,
  author_name text not null default 'System',
  body text not null,
  source_lead_note_id uuid null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_client_notes_client_id_idx
  on public.sales_client_notes (client_id, created_at desc);
