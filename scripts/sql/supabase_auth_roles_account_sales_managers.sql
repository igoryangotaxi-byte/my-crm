-- Allow Account Manager / Sales Manager roles in CRM auth tables.
-- Safe to re-run.

alter table public.crm_user_profiles
  drop constraint if exists crm_user_profiles_role_check;
alter table public.crm_user_profiles
  add constraint crm_user_profiles_role_check
  check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager'));

alter table public.crm_role_permissions
  drop constraint if exists crm_role_permissions_role_check;
alter table public.crm_role_permissions
  add constraint crm_role_permissions_role_check
  check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager'));

alter table public.crm_role_area_access
  drop constraint if exists crm_role_area_access_role_check;
alter table public.crm_role_area_access
  add constraint crm_role_area_access_role_check
  check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager'));

alter table public.crm_role_dashboard_block_access
  drop constraint if exists crm_role_dashboard_block_access_role_check;
alter table public.crm_role_dashboard_block_access
  add constraint crm_role_dashboard_block_access_role_check
  check (role in ('Admin', 'User', 'Team Lead', 'Account Manager', 'Sales Manager'));
