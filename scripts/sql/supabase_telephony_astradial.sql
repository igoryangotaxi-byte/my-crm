-- Astradial telephony mapping + call metadata (Appli source of truth for CRM links).
-- Provider media/recordings stay in Astradial; Appli stores references only.

create table if not exists public.telephony_agents (
  appli_user_id text primary key,
  provider text not null default 'astradial',
  provider_user_id text null,
  extension text not null,
  status text not null default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telephony_agents_extension_chk check (char_length(trim(extension)) > 0),
  constraint telephony_agents_status_chk check (
    status in ('available', 'busy', 'break', 'offline')
  ),
  constraint telephony_agents_provider_chk check (provider in ('astradial', 'threecx'))
);

create index if not exists telephony_agents_extension_idx
  on public.telephony_agents (extension);

comment on table public.telephony_agents is
  'Maps Appli users to Astradial (or other) PBX extensions. No SIP secrets stored.';

create table if not exists public.telephony_queues (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'astradial',
  provider_queue_id text not null,
  name text not null,
  department text null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telephony_queues_provider_qid_uniq unique (provider, provider_queue_id)
);

comment on table public.telephony_queues is
  'Optional cache of Astradial queues for Appli display labels.';

create table if not exists public.telephony_calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'astradial',
  provider_call_id text null,
  channel_id text null,
  direction text null,
  from_number text null,
  to_number text null,
  phone_key text null,
  status text not null default 'unknown',
  started_at timestamptz null,
  answered_at timestamptz null,
  ended_at timestamptz null,
  duration_sec integer null,
  agent_appli_user_id text null,
  agent_extension text null,
  queue_id uuid null references public.telephony_queues(id) on delete set null,
  recording_ref text null,
  crm_entity_type text null,
  crm_entity_id text null,
  trip_id text null,
  ticket_id text null,
  transcription text null,
  summary text null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent upgrades for existing databases
alter table public.telephony_calls add column if not exists transcription text;
alter table public.telephony_calls add column if not exists summary text;

create unique index if not exists telephony_calls_provider_call_id_uidx
  on public.telephony_calls (provider, provider_call_id)
  where provider_call_id is not null;

create index if not exists telephony_calls_phone_key_idx
  on public.telephony_calls (phone_key);

create index if not exists telephony_calls_started_at_idx
  on public.telephony_calls (started_at desc nulls last);

create index if not exists telephony_calls_agent_idx
  on public.telephony_calls (agent_appli_user_id);

create index if not exists telephony_calls_crm_entity_idx
  on public.telephony_calls (crm_entity_type, crm_entity_id);

comment on table public.telephony_calls is
  'Call metadata synchronized from Astradial webhooks/API. Recordings referenced, not duplicated.';

create table if not exists public.telephony_call_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid null references public.telephony_calls(id) on delete cascade,
  provider text not null default 'astradial',
  provider_event_id text not null,
  event_type text not null,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint telephony_call_events_provider_event_uniq unique (provider, provider_event_id)
);

create index if not exists telephony_call_events_call_id_idx
  on public.telephony_call_events (call_id);

comment on table public.telephony_call_events is
  'Idempotent Astradial webhook/event log keyed by provider_event_id.';
