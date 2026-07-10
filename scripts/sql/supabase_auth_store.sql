create table if not exists public.crm_user_profiles (
  id text primary key,
  auth_user_id uuid unique not null references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  account_type text not null default 'internal' check (account_type in ('internal', 'client')),
  phone_number text null,
  cost_center_id text null,
  tenant_id text null,
  corp_client_id text null,
  token_label text null,
  api_client_id text null,
  client_role_id text null,
  language text not null default 'en' check (language in ('en', 'he')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_user_profiles_account_type_idx
  on public.crm_user_profiles (account_type);

create index if not exists crm_user_profiles_tenant_id_idx
  on public.crm_user_profiles (tenant_id);

create table if not exists public.crm_role_permissions (
  role text primary key check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager')),
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_role_area_access (
  role text primary key check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager')),
  area_access jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_role_dashboard_block_access (
  role text primary key check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager')),
  dashboard_block_access jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tenant_accounts (
  id text primary key,
  name text not null,
  corp_client_id text not null,
  token_label text not null,
  api_client_id text not null,
  default_cost_center_id text null,
  pinned_default_cost_center_id text null,
  b2c_enabled boolean not null default false,
  b2c_token text null,
  b2c_client_id text null,
  b2c_ride_class text null,
  b2c_create_endpoint text null,
  client_portal_communications_enabled boolean not null default true,
  client_portal_financial_center_enabled boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_tenant_accounts_corp_token_client_uidx
  on public.crm_tenant_accounts (corp_client_id, token_label, api_client_id);

create table if not exists public.crm_tenant_roles (
  tenant_id text primary key references public.crm_tenant_accounts (id) on delete cascade,
  roles jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_global_b2c_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  token text null,
  client_id text null,
  ride_class text null,
  create_endpoint text null,
  updated_at timestamptz not null default now()
);
