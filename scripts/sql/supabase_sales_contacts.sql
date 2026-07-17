-- Sales Operation — Phase 3: multi-contact model for leads.
-- Additive: introduces a dedicated contacts table without touching sales_leads.

create table if not exists public.sales_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  full_name text not null,
  job_title text null,
  department text null,
  email text null,
  mobile_phone text null,
  office_phone text null,
  preferred_channel text null check (
    preferred_channel is null
    or preferred_channel in ('phone', 'email', 'whatsapp', 'sms', 'other')
  ),
  is_primary boolean not null default false,
  is_decision_maker boolean not null default false,
  notes text null,
  is_active boolean not null default true,
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_contacts_lead_id_idx
  on public.sales_contacts (lead_id, created_at asc);

-- At most one primary contact per lead.
create unique index if not exists sales_contacts_one_primary_idx
  on public.sales_contacts (lead_id)
  where is_primary;

-- Dedup within a lead by email (case-insensitive) and by mobile phone.
create unique index if not exists sales_contacts_lead_email_uidx
  on public.sales_contacts (lead_id, lower(email))
  where email is not null;

create unique index if not exists sales_contacts_lead_mobile_uidx
  on public.sales_contacts (lead_id, mobile_phone)
  where mobile_phone is not null;
