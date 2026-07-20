-- Global CRM feedback requests (widget → Telegram status workflow).
create table if not exists public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done')),
  created_by_user_id text not null,
  created_by_name text not null,
  created_by_email text null,
  created_by_role text null,
  pathname text null,
  telegram_chat_id text null,
  telegram_message_id bigint null,
  status_changed_at timestamptz null,
  status_notified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_requests_user_idx
  on public.feedback_requests (created_by_user_id, created_at desc);

create index if not exists feedback_requests_status_idx
  on public.feedback_requests (status, updated_at desc);
