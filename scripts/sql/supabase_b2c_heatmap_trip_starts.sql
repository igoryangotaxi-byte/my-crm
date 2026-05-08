-- B2C Heat Map source table (trip starts)
create table if not exists public.b2c_heatmap_trip_starts (
  id bigserial primary key,
  trip_ts timestamptz not null,
  source_lat double precision not null,
  source_lon double precision not null,
  order_id text null,
  created_at timestamptz not null default now()
);

create index if not exists b2c_heatmap_trip_starts_trip_ts_idx
  on public.b2c_heatmap_trip_starts (trip_ts);

create index if not exists b2c_heatmap_trip_starts_lat_lon_idx
  on public.b2c_heatmap_trip_starts (source_lat, source_lon);

