-- Durable Yango API token registry (survives Upstash KV outages / quota).
create table if not exists public.yango_token_registry (
  label text primary key,
  crm_client_name text not null,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yango_token_registry_label_chk check (char_length(trim(label)) > 0),
  constraint yango_token_registry_name_chk check (char_length(trim(crm_client_name)) > 0),
  constraint yango_token_registry_token_chk check (char_length(trim(token)) > 0)
);

create index if not exists yango_token_registry_updated_idx
  on public.yango_token_registry (updated_at desc);

alter table public.yango_token_registry enable row level security;

comment on table public.yango_token_registry is
  'Yango B2B API tokens for Token diagnostics / Pre-Orders / Orders. Service-role only.';
