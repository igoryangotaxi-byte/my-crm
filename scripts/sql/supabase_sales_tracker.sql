-- Sales Operation — Tracker MVP: projects, configurable statuses, tickets.
-- Additive: dedicated tracker_* tables; does not alter sales_tasks / personal space.

create table if not exists public.tracker_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  created_by_user_id text null,
  created_by_name text null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_projects_active_idx
  on public.tracker_projects (archived_at, updated_at desc);

create table if not exists public.tracker_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tracker_projects (id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  position integer not null default 0,
  wip_limit integer null,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_statuses_project_idx
  on public.tracker_statuses (project_id, position);

create table if not exists public.tracker_tickets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tracker_projects (id) on delete cascade,
  status_id uuid not null references public.tracker_statuses (id) on delete restrict,
  title text not null,
  description text null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz null,
  position numeric not null default 0,
  parent_ticket_id uuid null references public.tracker_tickets (id) on delete set null,
  created_by_user_id text null,
  created_by_name text null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_tickets_board_idx
  on public.tracker_tickets (project_id, status_id, position)
  where archived_at is null;

create index if not exists tracker_tickets_due_idx
  on public.tracker_tickets (due_at)
  where archived_at is null and due_at is not null;

create index if not exists tracker_tickets_creator_idx
  on public.tracker_tickets (created_by_user_id, updated_at desc);

create index if not exists tracker_tickets_parent_idx
  on public.tracker_tickets (parent_ticket_id)
  where parent_ticket_id is not null;

create table if not exists public.tracker_ticket_assignees (
  ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  user_id text not null,
  user_name text null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create index if not exists tracker_ticket_assignees_user_idx
  on public.tracker_ticket_assignees (user_id, ticket_id);

create table if not exists public.tracker_labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tracker_projects (id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  created_at timestamptz not null default now()
);

create unique index if not exists tracker_labels_project_name_uidx
  on public.tracker_labels (project_id, lower(name));

create table if not exists public.tracker_ticket_labels (
  ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  label_id uuid not null references public.tracker_labels (id) on delete cascade,
  primary key (ticket_id, label_id)
);

create table if not exists public.tracker_checklist_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_checklist_ticket_idx
  on public.tracker_checklist_items (ticket_id, position);

create table if not exists public.tracker_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  author_user_id text null,
  author_name text null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_comments_ticket_idx
  on public.tracker_comments (ticket_id, created_at desc);

create table if not exists public.tracker_ticket_links (
  id uuid primary key default gen_random_uuid(),
  from_ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  to_ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  link_type text not null check (
    link_type in ('blocks', 'blocked_by', 'parent', 'child', 'related', 'duplicate')
  ),
  created_by_user_id text null,
  created_at timestamptz not null default now(),
  constraint tracker_ticket_links_no_self check (from_ticket_id <> to_ticket_id)
);

create unique index if not exists tracker_ticket_links_uidx
  on public.tracker_ticket_links (from_ticket_id, to_ticket_id, link_type);

create index if not exists tracker_ticket_links_to_idx
  on public.tracker_ticket_links (to_ticket_id);

create table if not exists public.tracker_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  actor_user_id text null,
  actor_name text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tracker_activity_ticket_idx
  on public.tracker_activity (ticket_id, created_at desc);

create table if not exists public.tracker_files (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tracker_tickets (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by_user_id text null,
  uploaded_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists tracker_files_ticket_idx
  on public.tracker_files (ticket_id, created_at desc);
