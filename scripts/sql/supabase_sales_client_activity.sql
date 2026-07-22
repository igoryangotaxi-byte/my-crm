-- Client profile activity + My Space calendar sync (additive).

-- Link personal tasks/notes back to CRM clients.
alter table public.sales_personal_tasks
  add column if not exists client_id uuid null references public.sales_clients (id) on delete set null,
  add column if not exists lead_id uuid null references public.sales_leads (id) on delete set null,
  add column if not exists source_client_id uuid null references public.sales_clients (id) on delete set null;

create index if not exists sales_personal_tasks_client_idx
  on public.sales_personal_tasks (client_id, due_at);

alter table public.sales_personal_notes
  add column if not exists client_id uuid null references public.sales_clients (id) on delete set null,
  add column if not exists source_client_note_id uuid null references public.sales_client_notes (id) on delete set null;

create index if not exists sales_personal_notes_client_idx
  on public.sales_personal_notes (client_id, created_at desc);

create unique index if not exists sales_personal_notes_source_client_note_uidx
  on public.sales_personal_notes (source_client_note_id)
  where source_client_note_id is not null;

-- Meetings (CRM + optional Google Calendar event id).
create table if not exists public.sales_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  client_id uuid null references public.sales_clients (id) on delete set null,
  title text not null,
  description text null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_event_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_meetings_user_idx
  on public.sales_meetings (user_id, starts_at);

create index if not exists sales_meetings_client_idx
  on public.sales_meetings (client_id, starts_at);

-- Per-user Google Calendar OAuth tokens (separate from SSO login).
create table if not exists public.sales_google_calendar_tokens (
  user_id text primary key,
  refresh_token text not null,
  access_token text null,
  expiry_date timestamptz null,
  scope text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
