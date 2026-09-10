-- Telegram Support bot session state (multi-step: title → description → ticket).
create table if not exists public.telegram_support_sessions (
  chat_id text primary key,
  step text not null default 'idle'
    check (step in ('idle', 'awaiting_description')),
  title text,
  telegram_user_id text,
  telegram_username text,
  telegram_name text,
  updated_at timestamptz not null default now()
);

create index if not exists telegram_support_sessions_updated_idx
  on public.telegram_support_sessions (updated_at desc);

alter table public.telegram_support_sessions enable row level security;
