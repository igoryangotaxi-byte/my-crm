-- Drivers Pipeline: recruitment leads (separate from B2B sales_leads)

create table if not exists public.driver_leads (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'registered', 'rejected')),
  source text not null default 'manual'
    check (source in ('manual', 'import', 'wordpress')),
  full_name text not null,
  email text null,
  phone text null,
  rejected_substatus text null,
  campaign_name text null,
  form_id text null,
  custom_fields jsonb not null default '{}'::jsonb,
  assigned_manager_user_id text null,
  assigned_manager_name text null,
  general_notes text null,
  status_entered_at timestamptz not null default now(),
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_leads_status_idx on public.driver_leads (status);
create index if not exists driver_leads_status_entered_at_idx
  on public.driver_leads (status_entered_at desc);
create index if not exists driver_leads_created_at_idx on public.driver_leads (created_at desc);
create index if not exists driver_leads_phone_idx on public.driver_leads (phone);
create index if not exists driver_leads_email_idx on public.driver_leads (email);

create unique index if not exists driver_leads_submission_id_uidx
  on public.driver_leads ((custom_fields->>'submission_id'))
  where coalesce(custom_fields->>'submission_id', '') <> '';

create unique index if not exists driver_leads_sheet_row_key_uidx
  on public.driver_leads ((custom_fields->>'sheet_row_key'))
  where coalesce(custom_fields->>'sheet_row_key', '') <> '';

create table if not exists public.driver_lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.driver_leads (id) on delete cascade,
  author_user_id text null,
  author_name text not null default 'System',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_lead_notes_lead_id_idx
  on public.driver_lead_notes (lead_id, created_at desc);

create table if not exists public.driver_lead_status_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.driver_leads (id) on delete cascade,
  from_status text null
    check (from_status is null or from_status in ('new', 'in_progress', 'registered', 'rejected')),
  to_status text not null
    check (to_status in ('new', 'in_progress', 'registered', 'rejected')),
  changed_by_user_id text null,
  changed_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists driver_lead_status_events_lead_id_idx
  on public.driver_lead_status_events (lead_id, created_at desc);
