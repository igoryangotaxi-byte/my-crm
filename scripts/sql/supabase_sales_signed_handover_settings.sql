-- Signed B2B handover settings (single-row).
-- Default Account Manager + Tracker project for auto launch-prep tickets.

create table if not exists public.sales_signed_handover_settings (
  id text primary key default 'default',
  default_account_manager_user_id text null,
  default_account_manager_name text null,
  tracker_project_id uuid null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_signed_handover_settings_singleton check (id = 'default')
);

insert into public.sales_signed_handover_settings (id)
values ('default')
on conflict (id) do nothing;
