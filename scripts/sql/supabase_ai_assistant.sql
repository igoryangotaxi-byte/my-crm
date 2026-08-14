-- Appli AI Executive Assistant — conversations, audit, prefs, integrations, usage.
-- Additive. Apply via scripts/apply-sales-operation-schema.js (or SQL Editor).

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text null,
  openclaw_session_key text not null,
  page_context jsonb null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id text not null,
  role text not null,
  content text not null default '',
  ui_blocks jsonb not null default '[]'::jsonb,
  tool_name text null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

create table if not exists public.ai_user_preferences (
  user_id text primary key,
  timezone text not null default 'Asia/Jerusalem',
  locale text not null default 'en',
  preferred_meeting_minutes int not null default 30,
  working_hours_start text not null default '09:00',
  working_hours_end text not null default '18:00',
  avoid_start text not null default '12:00',
  avoid_end text not null default '13:00',
  preferred_focus text not null default 'mornings',
  meeting_provider text not null default 'google_meet',
  auto_low_risk_writes boolean not null default true,
  allow_direct_send_email boolean not null default false,
  allow_direct_send_telegram boolean not null default false,
  voice_shortcut text not null default 'Alt+Space',
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid null references public.ai_conversations (id) on delete set null,
  agent_session_id text null,
  tool text not null,
  action text not null,
  params_redacted jsonb not null default '{}'::jsonb,
  result_status text not null,
  approval_state text not null default 'none',
  latency_ms int null,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists ai_actions_user_idx
  on public.ai_actions (user_id, created_at desc);

create table if not exists public.ai_action_idempotency (
  user_id text not null,
  idempotency_key text not null,
  tool text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create table if not exists public.ai_confirmations (
  token text primary key,
  user_id text not null,
  tool text not null,
  args jsonb not null,
  preview jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists ai_confirmations_user_idx
  on public.ai_confirmations (user_id, expires_at);

create table if not exists public.ai_notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null,
  cron_expr text null,
  fire_at timestamptz null,
  channels text[] not null default array['in_app']::text[],
  enabled boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  last_fired_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists ai_notification_rules_user_idx
  on public.ai_notification_rules (user_id, enabled);

create table if not exists public.ai_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  body text not null,
  due_at timestamptz not null,
  channels text[] not null default array['in_app']::text[],
  delivered_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists ai_reminders_due_idx
  on public.ai_reminders (due_at)
  where delivered_at is null;

create table if not exists public.ai_usage_daily (
  user_id text not null,
  day date not null,
  requests int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  stt_seconds numeric not null default 0,
  tts_seconds numeric not null default 0,
  estimated_cost_usd numeric not null default 0,
  primary key (user_id, day)
);

create table if not exists public.ai_telegram_links (
  user_id text primary key,
  telegram_chat_id text not null unique,
  telegram_username text null,
  link_code text null,
  linked_at timestamptz not null default now()
);

create table if not exists public.ai_gmail_tokens (
  user_id text primary key,
  refresh_token text not null,
  access_token text null,
  expiry_date timestamptz null,
  scope text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid null,
  kind text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb null,
  error text null,
  created_at timestamptz not null default now(),
  finished_at timestamptz null
);

create index if not exists ai_jobs_status_idx
  on public.ai_jobs (status, created_at);
