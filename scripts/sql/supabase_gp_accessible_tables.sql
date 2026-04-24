create table if not exists public.gp_accessible_tables (
  id bigserial primary key,
  snapshot_at timestamptz not null,
  table_schema text not null,
  table_name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists gp_accessible_tables_unique_snapshot_object_idx
  on public.gp_accessible_tables (snapshot_at, table_schema, table_name);

create index if not exists gp_accessible_tables_snapshot_idx
  on public.gp_accessible_tables (snapshot_at desc);

create index if not exists gp_accessible_tables_schema_name_idx
  on public.gp_accessible_tables (table_schema, table_name);

with last_snapshot as (
  select
    started_at as snapshot_at,
    error_text::jsonb as payload
  from public.sync_runs
  where source_name = 'greenplum_accessible_tables_snapshot'
    and status = 'success'
    and error_text is not null
  order by started_at desc
  limit 1
),
expanded as (
  select
    last_snapshot.snapshot_at,
    item.table_schema,
    item.table_name
  from last_snapshot
  cross join lateral jsonb_to_recordset(last_snapshot.payload) as item(
    table_schema text,
    table_name text
  )
)
insert into public.gp_accessible_tables (snapshot_at, table_schema, table_name)
select snapshot_at, table_schema, table_name
from expanded
on conflict (snapshot_at, table_schema, table_name) do nothing;
