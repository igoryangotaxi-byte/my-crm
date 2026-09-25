-- CRM last login (SSO does not update auth.users.last_sign_in_at).
-- Apply in Supabase SQL Editor or via Management API.

alter table public.crm_user_profiles
  add column if not exists last_login_at timestamptz null;

comment on column public.crm_user_profiles.last_login_at is
  'Last CRM session login (Google SSO / session). Preferred over auth.users.last_sign_in_at.';

-- Backfill from GoTrue when available.
update public.crm_user_profiles p
set last_login_at = u.last_sign_in_at
from auth.users u
where p.auth_user_id = u.id
  and p.last_login_at is null
  and u.last_sign_in_at is not null;
