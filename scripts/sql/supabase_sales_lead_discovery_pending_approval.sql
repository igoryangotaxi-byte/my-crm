-- Lead Discovery: candidates can exist before pipeline approval.
-- Apply in Supabase SQL editor after supabase_sales_lead_discovery.sql

alter table public.sales_lead_discovery
  add column if not exists id uuid,
  add column if not exists company_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists approved_at timestamptz,
  add column if not exists pending_sticker_keys jsonb not null default '[]'::jsonb;

update public.sales_lead_discovery
set id = coalesce(id, gen_random_uuid())
where id is null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'sales_lead_discovery'
      and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'sales_lead_discovery_pkey'
  ) then
    alter table public.sales_lead_discovery drop constraint sales_lead_discovery_pkey;
  end if;
exception when others then
  null;
end $$;

alter table public.sales_lead_discovery
  alter column lead_id drop not null;

alter table public.sales_lead_discovery
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'sales_lead_discovery'
      and constraint_type = 'PRIMARY KEY'
  ) then
    alter table public.sales_lead_discovery add primary key (id);
  end if;
exception when others then
  null;
end $$;

create unique index if not exists sales_lead_discovery_lead_id_uidx
  on public.sales_lead_discovery (lead_id)
  where lead_id is not null;

-- Existing rows already in pipeline count as approved
update public.sales_lead_discovery
set approved_at = coalesce(approved_at, discovered_at, now())
where lead_id is not null
  and approved_at is null;
