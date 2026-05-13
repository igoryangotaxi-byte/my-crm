-- Mind Map boards (React Flow document stored as JSON)
create table if not exists public.mind_maps (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled map',
  document jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  created_by text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mind_maps_updated_at_idx on public.mind_maps (updated_at desc);
create index if not exists mind_maps_created_by_idx on public.mind_maps (created_by);

comment on table public.mind_maps is 'CRM Notes Mind Map boards; document holds React Flow nodes/edges/viewport.';
