-- Sales Operation — shared Documentation wiki.
-- Additive: dedicated documentation_documents table; content is TipTap JSON.

create table if not exists public.documentation_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  position integer not null default 0,
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  created_by_user_id text null,
  created_by_name text null,
  updated_by_user_id text null,
  updated_by_name text null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documentation_documents_active_idx
  on public.documentation_documents (position, updated_at desc)
  where archived_at is null;
