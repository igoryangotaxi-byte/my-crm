-- Sales Operation — My Space: private per-user tasks and notes.
-- Additive: two standalone tables scoped to a single user (by app user id +
-- email). These are NOT tied to a lead and are only visible to their owner.

create table if not exists public.sales_personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text null,
  title text not null,
  description text null,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_personal_tasks_user_idx
  on public.sales_personal_tasks (user_id, status, due_at);

create table if not exists public.sales_personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text null,
  title text null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_personal_notes_user_idx
  on public.sales_personal_notes (user_id, pinned desc, updated_at desc);
