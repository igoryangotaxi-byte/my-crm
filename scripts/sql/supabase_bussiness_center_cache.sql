create table if not exists public.crm_bussiness_center_cache (
  cache_key text primary key,
  token_label text not null,
  client_id text not null,
  since_iso timestamptz not null,
  till_iso timestamptz not null,
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists idx_crm_bussiness_center_cache_scope
  on public.crm_bussiness_center_cache (token_label, client_id, updated_at desc);
