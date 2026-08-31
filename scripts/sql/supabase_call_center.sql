-- Per-operator 3CX Call Center mapping (company PBX credentials stay in env).

create table if not exists public.call_center_user_settings (
  user_id text primary key,
  extension text not null,
  preferred_device_id text null,
  operator_status text not null default 'available',
  notifications_muted boolean not null default false,
  threecx_user_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_center_user_settings_extension_chk check (char_length(trim(extension)) > 0),
  constraint call_center_user_settings_status_chk check (
    operator_status in ('available', 'away', 'dnd', 'offline')
  )
);

-- Additive upgrades for existing installs.
alter table public.call_center_user_settings
  add column if not exists operator_status text not null default 'available';

alter table public.call_center_user_settings
  add column if not exists notifications_muted boolean not null default false;

alter table public.call_center_user_settings
  add column if not exists threecx_user_id text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'call_center_user_settings_status_chk'
  ) then
    alter table public.call_center_user_settings
      add constraint call_center_user_settings_status_chk check (
        operator_status in ('available', 'away', 'dnd', 'offline')
      );
  end if;
end $$;

comment on table public.call_center_user_settings is
  'Maps CRM users to their 3CX extension DN, preferred device, operator status, and notification prefs.';

-- Call history pushed from 3CX Bar Oz CRM Integration (Call Report).
create table if not exists public.call_center_calls (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  phone_key text null,
  queue text null,
  direction text null,
  call_type text null,
  contact_name text null,
  agent_extension text null,
  agent_name text null,
  crm_user_id text null,
  duration_sec integer null,
  call_at timestamptz null,
  description text null,
  recording_url text null,
  summary text null,
  transcription text null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists call_center_calls_call_at_idx
  on public.call_center_calls (call_at desc nulls last);

create index if not exists call_center_calls_agent_ext_idx
  on public.call_center_calls (agent_extension);

create index if not exists call_center_calls_crm_user_idx
  on public.call_center_calls (crm_user_id);

create index if not exists call_center_calls_phone_key_idx
  on public.call_center_calls (phone_key);

comment on table public.call_center_calls is
  'Inbound Call Report payloads from 3CX CRM Integration (includes recording URL when PBX recording is on).';
