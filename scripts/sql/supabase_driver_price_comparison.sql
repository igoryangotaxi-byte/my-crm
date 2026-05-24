-- Driver price comparison: taxi orders from Greenplum + mone prices from taxitariff imports

create table if not exists public.taxi_orders (
  order_id text primary key,
  order_date timestamptz not null,
  corp_client_id text null,
  client_price numeric null,
  driver_price_with_vat numeric null,
  actual_km numeric null,
  actual_minutes numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists taxi_orders_order_date_idx
  on public.taxi_orders (order_date desc);

create index if not exists taxi_orders_corp_client_id_idx
  on public.taxi_orders (corp_client_id);

create index if not exists taxi_orders_fallback_match_idx
  on public.taxi_orders (order_date, actual_km, actual_minutes, driver_price_with_vat);

create table if not exists public.mone_price_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by text null,
  uploaded_at timestamptz not null default now(),
  status text not null default 'pending',
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  error_summary jsonb null,
  created_by_user_id text null
);

create index if not exists mone_price_imports_uploaded_at_idx
  on public.mone_price_imports (uploaded_at desc);

create table if not exists public.mone_prices (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.mone_price_imports (id) on delete cascade,
  order_id text null,
  mone_price numeric not null,
  raw_order_date timestamptz null,
  raw_actual_km numeric null,
  raw_actual_minutes numeric null,
  raw_driver_price_with_vat numeric null,
  match_status text not null,
  matched_order_id text null references public.taxi_orders (order_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mone_prices_import_id_idx
  on public.mone_prices (import_id);

create index if not exists mone_prices_matched_order_id_idx
  on public.mone_prices (matched_order_id)
  where matched_order_id is not null;

create unique index if not exists mone_prices_matched_order_id_active_uniq
  on public.mone_prices (matched_order_id)
  where matched_order_id is not null
    and match_status in ('matched_by_order_id', 'matched_by_fallback');

create index if not exists mone_prices_order_id_idx
  on public.mone_prices (order_id)
  where order_id is not null;

-- Enriched view: taxi orders joined with latest matched mone price
create or replace view public.driver_price_comparison_enriched as
with latest_mone as (
  select distinct on (mp.matched_order_id)
    mp.matched_order_id,
    mp.mone_price,
    mp.match_status,
    mp.import_id
  from public.mone_prices mp
  where mp.matched_order_id is not null
    and mp.match_status in ('matched_by_order_id', 'matched_by_fallback')
  order by mp.matched_order_id, mp.created_at desc
)
select
  t.order_id,
  t.order_date,
  to_char(t.order_date at time zone 'Asia/Jerusalem', 'HH24:MI') as order_time,
  trim(to_char(t.order_date at time zone 'Asia/Jerusalem', 'Day')) as day_of_week,
  extract(hour from (t.order_date at time zone 'Asia/Jerusalem'))::int as hour,
  t.corp_client_id,
  t.client_price,
  t.driver_price_with_vat,
  t.actual_km as distance_km,
  t.actual_minutes as time_min,
  lm.mone_price,
  (t.driver_price_with_vat - lm.mone_price) as difference_nis,
  case
    when lm.mone_price is null or lm.mone_price = 0 then null
    else ((t.driver_price_with_vat - lm.mone_price) / lm.mone_price * 100)
  end as difference_percent,
  abs(t.driver_price_with_vat - lm.mone_price) as absolute_difference_nis,
  case
    when t.driver_price_with_vat = 0
      and coalesce(t.actual_km, 0) = 0
      and coalesce(t.actual_minutes, 0) = 0 then 'No price'
    when abs(t.driver_price_with_vat - lm.mone_price) < 0.5 then 'No difference'
    when t.driver_price_with_vat > lm.mone_price then 'Driver price higher'
    else 'Mone price higher'
  end as difference_flag,
  case
    when t.actual_km is null then null
    when t.actual_km < 3 then '0-3 km'
    when t.actual_km < 5 then '3-5 km'
    when t.actual_km < 10 then '5-10 km'
    when t.actual_km < 20 then '10-20 km'
    else '20+ km'
  end as distance_bucket
from public.taxi_orders t
inner join latest_mone lm on lm.matched_order_id = t.order_id
where lm.mone_price is not null;
