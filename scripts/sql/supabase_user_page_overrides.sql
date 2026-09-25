-- Per-user page access overrides (Settings → Access management).
-- Apply in Supabase SQL Editor. Deploy alone does not run this.
--
-- Prerequisite: public.crm_user_profiles must exist.
-- If you get "relation does not exist", run first (in order):
--   1) scripts/sql/supabase_auth_store.sql
--   2) scripts/sql/supabase_auth_roles_account_sales_managers.sql
--   3) this file
-- Then migrate users from KV if needed:
--   npx tsx scripts/migrate-auth-kv-to-supabase.ts
--
-- Note: without crm_* tables the app falls back to Auth metadata + KV;
-- page overrides still persist via KV in that mode. This SQL is only
-- required when you use the crm_user_profiles persistence path.

do $$
begin
  if to_regclass('public.crm_user_profiles') is null then
    raise exception
      'public.crm_user_profiles does not exist. Run scripts/sql/supabase_auth_store.sql first, then re-run this file.';
  end if;
end $$;

alter table public.crm_user_profiles
  add column if not exists page_overrides jsonb not null default '{}'::jsonb;

comment on column public.crm_user_profiles.page_overrides is
  'Partial AppPageKey → boolean overrides on top of role defaults. Admin ignores overrides (always full access).';
