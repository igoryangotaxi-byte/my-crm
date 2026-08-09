-- Pre-Order Route Bundles (Ops HUB workspace).

create table if not exists public.preorder_route_bundle_settings (
  id text primary key default 'default',
  max_orders_per_bundle int not null default 4,
  min_safety_buffer_min int not null default 10,
  max_empty_drive_km numeric not null default 40,
  traffic_aware boolean not null default true,
  auto_generate_suggestions boolean not null default false,
  allow_insert_into_accepted boolean not null default false,
  service_duration_fallback_min int not null default 25,
  max_matrix_cells_per_generate int not null default 4000,
  max_candidate_orders int not null default 120,
  updated_by text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint preorder_route_bundle_settings_singleton check (id = 'default'),
  constraint preorder_route_bundle_settings_max_orders check (max_orders_per_bundle between 2 and 10),
  constraint preorder_route_bundle_settings_buffer check (min_safety_buffer_min between 0 and 120)
);

insert into public.preorder_route_bundle_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.preorder_route_bundles (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'suggested',
  health text not null default 'safe',
  driver_id text null,
  driver_name text null,
  driver_phone text null,
  token_label text null,
  min_buffer_sec int not null default 0,
  empty_drive_m int not null default 0,
  empty_drive_sec int not null default 0,
  total_distance_m int not null default 0,
  score numeric not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  explain_text text null,
  window_start timestamptz null,
  window_end timestamptz null,
  created_by text null,
  updated_by text null,
  confirmed_at timestamptz null,
  contacted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preorder_route_bundles_status_chk check (
    status in (
      'suggested',
      'reviewing',
      'driver_contacted',
      'accepted',
      'rejected',
      'active',
      'completed',
      'cancelled'
    )
  ),
  constraint preorder_route_bundles_health_chk check (
    health in ('safe', 'tight', 'at_risk', 'conflict')
  )
);

create index if not exists preorder_route_bundles_status_idx
  on public.preorder_route_bundles (status, updated_at desc);

create table if not exists public.preorder_route_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.preorder_route_bundles (id) on delete cascade,
  sequence int not null,
  order_id text not null,
  token_label text not null,
  client_id text not null,
  client_name text not null,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat double precision not null,
  pickup_lon double precision not null,
  dropoff_lat double precision not null,
  dropoff_lon double precision not null,
  scheduled_at timestamptz not null,
  expected_pickup_arrival timestamptz null,
  expected_dropoff timestamptz null,
  empty_drive_from_prev_sec int not null default 0,
  empty_drive_from_prev_m int not null default 0,
  buffer_before_pickup_sec int not null default 0,
  service_duration_sec int not null default 0,
  service_duration_confidence text not null default 'estimated',
  created_at timestamptz not null default now(),
  unique (bundle_id, sequence),
  unique (bundle_id, order_id)
);

create index if not exists preorder_route_bundle_items_order_idx
  on public.preorder_route_bundle_items (order_id);

create table if not exists public.preorder_route_bundle_snapshots (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.preorder_route_bundles (id) on delete cascade,
  reason text not null,
  passenger_geojson jsonb null,
  empty_drive_geojson jsonb null,
  full_polyline_coordinates jsonb null,
  google_metadata jsonb not null default '{}'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  calculator_version text not null default 'route-bundles-v1'
);

create index if not exists preorder_route_bundle_snapshots_bundle_idx
  on public.preorder_route_bundle_snapshots (bundle_id, calculated_at desc);

create table if not exists public.preorder_route_bundle_opportunities (
  id uuid primary key default gen_random_uuid(),
  target_bundle_id uuid not null references public.preorder_route_bundles (id) on delete cascade,
  candidate_order_id text not null,
  candidate_token_label text not null,
  proposed_sequence jsonb not null,
  delta_empty_drive_m int not null default 0,
  delta_empty_drive_sec int not null default 0,
  min_buffer_sec int not null default 0,
  score_delta numeric not null default 0,
  summary text null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preorder_route_bundle_opportunities_status_chk check (
    status in ('open', 'accepted', 'dismissed', 'expired')
  )
);

create index if not exists preorder_route_bundle_opportunities_open_idx
  on public.preorder_route_bundle_opportunities (status, target_bundle_id)
  where status = 'open';

create table if not exists public.preorder_route_bundle_events (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.preorder_route_bundles (id) on delete cascade,
  actor_user_id text null,
  actor_name text null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists preorder_route_bundle_events_bundle_idx
  on public.preorder_route_bundle_events (bundle_id, created_at desc);
