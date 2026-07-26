-- Lead Discovery module (additive). Feature-gated in app via LEAD_DISCOVERY_ENABLED.

-- Campaigns
create table if not exists public.sales_discovery_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  country text not null default 'Israel',
  cities jsonb not null default '[]'::jsonb,
  districts jsonb not null default '[]'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  excluded_keywords jsonb not null default '[]'::jsonb,
  maps_queries jsonb not null default '[]'::jsonb,
  search_radius_m integer null,
  min_rating numeric null,
  min_reviews integer null,
  website_required boolean not null default false,
  email_required boolean not null default false,
  phone_required boolean not null default false,
  min_taxi_score integer not null default 60,
  company_size_mode text not null default 'likely_50_plus'
    check (company_size_mode in ('strict_50_plus', 'likely_50_plus', 'include_unknown')),
  daily_lead_target integer not null default 10,
  max_leads_per_run integer not null default 50,
  run_schedule text null,
  timezone text not null default 'Asia/Jerusalem',
  pipeline_stage text not null default 'new',
  default_owner_user_id text null,
  default_owner_name text null,
  assignment_rule text not null default 'fixed'
    check (assignment_rule in ('fixed', 'round_robin', 'none')),
  sticker_keys jsonb not null default '["cold_lead"]'::jsonb,
  rule_set_id uuid null,
  segment_id uuid null,
  email_sequence_id uuid null,
  manual_approval boolean not null default true,
  auto_add_to_pipeline boolean not null default true,
  auto_start_email_sequence boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed', 'error')),
  last_run_at timestamptz null,
  next_run_at timestamptz null,
  last_error text null,
  created_by_user_id text null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_discovery_campaigns_status_idx
  on public.sales_discovery_campaigns (status);

-- Runs + jobs (Postgres queue)
create table if not exists public.sales_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sales_discovery_campaigns(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz null,
  finished_at timestamptz null,
  found_count integer not null default 0,
  qualified_count integer not null default 0,
  rejected_count integer not null default 0,
  duplicate_count integer not null default 0,
  size_fail_count integer not null default 0,
  insufficient_data_count integer not null default 0,
  added_to_pipeline_count integer not null default 0,
  error_message text null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid null references public.sales_discovery_campaigns(id) on delete set null,
  run_id uuid null references public.sales_discovery_runs(id) on delete set null,
  job_type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  locked_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_discovery_jobs_queue_idx
  on public.sales_discovery_jobs (status, available_at)
  where status = 'queued';

-- Sidecar discovery data for a sales lead (lead_id null until Approve)
create table if not exists public.sales_lead_discovery (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null unique references public.sales_leads(id) on delete cascade,
  campaign_id uuid null references public.sales_discovery_campaigns(id) on delete set null,
  run_id uuid null references public.sales_discovery_runs(id) on delete set null,
  company_name text null,
  email text null,
  phone text null,
  address text null,
  google_place_id text null,
  domain text null,
  website text null,
  city text null,
  district text null,
  country text not null default 'Israel',
  latitude numeric null,
  longitude numeric null,
  google_category text null,
  business_categories jsonb not null default '[]'::jsonb,
  rating numeric null,
  reviews_count integer null,
  business_status text null,
  source text not null default 'google_places',
  source_url text null,
  employee_size_estimate text not null default 'Unknown'
    check (employee_size_estimate in ('1-10','11-49','50-99','100-249','250-499','500+','Unknown')),
  employee_size_confidence text not null default 'Low'
    check (employee_size_confidence in ('Low','Medium','High')),
  taxi_potential_score integer not null default 0,
  qualification_status text not null default 'pending'
    check (qualification_status in (
      'pending','high_potential','medium_potential','low_potential','disqualified','manual_review'
    )),
  score_breakdown jsonb not null default '[]'::jsonb,
  confirmed_signals jsonb not null default '[]'::jsonb,
  inferred_signals jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  recommended_use_cases jsonb not null default '[]'::jsonb,
  recommended_department text null,
  email_personalisation_line text null,
  data_completeness_score integer not null default 0,
  llm_confidence text null,
  llm_model text null,
  llm_prompt_version text null,
  qualification_mode text not null default 'rules'
    check (qualification_mode in ('ai','rules','hybrid')),
  website_content_hash text null,
  enrichment jsonb not null default '{}'::jsonb,
  pending_sticker_keys jsonb not null default '[]'::jsonb,
  requires_manual_review boolean not null default false,
  do_not_contact boolean not null default false,
  duplicate_confidence numeric null,
  discovered_at timestamptz not null default now(),
  last_enriched_at timestamptz null,
  last_qualified_at timestamptz null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_lead_discovery_place_id_uidx
  on public.sales_lead_discovery (google_place_id)
  where google_place_id is not null;

create index if not exists sales_lead_discovery_domain_idx
  on public.sales_lead_discovery (domain)
  where domain is not null;

create index if not exists sales_lead_discovery_campaign_idx
  on public.sales_lead_discovery (campaign_id);

-- System / user stickers
create table if not exists public.sales_stickers (
  key text primary key,
  label text not null,
  is_system boolean not null default true,
  color text null,
  icon text null,
  description text null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_lead_stickers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  sticker_key text not null references public.sales_stickers(key) on delete cascade,
  assigned_by text not null default 'system',
  assigned_by_user_id text null,
  reason text null,
  evidence jsonb not null default '{}'::jsonb,
  removable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (lead_id, sticker_key)
);

create index if not exists sales_lead_stickers_lead_idx
  on public.sales_lead_stickers (lead_id);

insert into public.sales_stickers (key, label, is_system)
values
  ('cold_lead', 'Cold Lead', true),
  ('high_taxi_potential', 'High Taxi Potential', true),
  ('medium_taxi_potential', 'Medium Taxi Potential', true),
  ('low_taxi_potential', 'Low Taxi Potential', true),
  ('employees_50_plus', '50+ Employees', true),
  ('employees_100_plus', '100+ Employees', true),
  ('size_not_confirmed', 'Size Not Confirmed', true),
  ('public_email_found', 'Public Email Found', true),
  ('no_email', 'No Email', true),
  ('phone_found', 'Phone Found', true),
  ('multi_location', 'Multi-location', true),
  ('multi_city', 'Multi-city', true),
  ('business_24_7', '24/7 Business', true),
  ('shift_workers', 'Shift Workers', true),
  ('active_hiring', 'Active Hiring', true),
  ('airport_potential', 'Airport Potential', true),
  ('employee_transport_signal', 'Employee Transport Signal', true),
  ('business_travel_signal', 'Business Travel Signal', true),
  ('needs_manual_review', 'Needs Manual Review', true),
  ('ai_qualified', 'AI Qualified', true),
  ('rules_only', 'Rules Only', true),
  ('ai_qualification_pending', 'AI Qualification Pending', true),
  ('email_sequence_active', 'Email Sequence Active', true),
  ('email_sent', 'Email Sent', true),
  ('replied', 'Replied', true),
  ('bounce', 'Bounce', true),
  ('unsubscribed', 'Unsubscribed', true),
  ('do_not_contact', 'Do Not Contact', true),
  ('duplicate_suspected', 'Duplicate Suspected', true)
on conflict (key) do nothing;

-- Qualification rules
create table if not exists public.sales_discovery_rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_discovery_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.sales_discovery_rule_sets(id) on delete cascade,
  name text not null,
  signal_key text not null,
  weight integer not null default 0,
  enabled boolean not null default true,
  is_disqualify boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sales_discovery_rule_sets (id, name, description, is_default)
values (
  '00000000-0000-4000-8000-000000000001',
  'Default Israel B2B Taxi',
  'Default Taxi Potential Score rules',
  true
)
on conflict (id) do nothing;

insert into public.sales_discovery_rules (rule_set_id, name, signal_key, weight, enabled, is_disqualify, sort_order)
select '00000000-0000-4000-8000-000000000001', name, signal_key, weight, true, is_disqualify, sort_order
from (values
  ('Hotel', 'category_hotel', 30, false, 10),
  ('Hospital', 'category_hospital', 30, false, 20),
  ('Medical centre', 'category_medical', 25, false, 30),
  ('Works 24/7', 'works_24_7', 20, false, 40),
  ('Night shifts', 'night_shifts', 20, false, 50),
  ('More than one location', 'multi_location', 15, false, 60),
  ('More than three locations', 'multi_location_3plus', 20, false, 70),
  ('More than one city', 'multi_city', 15, false, 80),
  ('Estimated 50+ employees', 'size_50_plus', 20, false, 90),
  ('Estimated 100+ employees', 'size_100_plus', 25, false, 100),
  ('Estimated 250+ employees', 'size_250_plus', 30, false, 110),
  ('Airport transfer mentioned', 'airport_transfer', 15, false, 120),
  ('Employee transport mentioned', 'employee_transport', 20, false, 130),
  ('Business travel mentioned', 'business_travel', 15, false, 140),
  ('Shuttle mentioned', 'shuttle', 15, false, 150),
  ('Careers page found', 'careers_page', 10, false, 160),
  ('Active hiring', 'active_hiring', 10, false, 170),
  ('More than ten open jobs', 'jobs_10_plus', 10, false, 180),
  ('Public business email found', 'public_email', 10, false, 190),
  ('Public phone found', 'public_phone', 5, false, 200),
  ('International business', 'international', 10, false, 210),
  ('Located in business district', 'business_district', 5, false, 220),
  ('Logistics-heavy business', 'logistics', 15, false, 230),
  ('Shift-based business', 'shift_based', 20, false, 240),
  ('Guests or visitors mentioned', 'guests_visitors', 10, false, 250),
  ('No website', 'no_website', -10, false, 260),
  ('No email and no phone', 'no_contact', -20, false, 270),
  ('Company permanently closed', 'permanently_closed', 0, true, 280),
  ('Individual professional', 'individual_pro', -30, false, 290),
  ('Microbusiness', 'microbusiness', -30, false, 300)
) as v(name, signal_key, weight, is_disqualify, sort_order)
where not exists (
  select 1 from public.sales_discovery_rules r
  where r.rule_set_id = '00000000-0000-4000-8000-000000000001'
    and r.signal_key = v.signal_key
);

-- Discovery segments (Phase 3)
create table if not exists public.sales_discovery_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  colour text null,
  owner_user_id text null,
  segment_type text not null default 'dynamic'
    check (segment_type in ('static', 'dynamic')),
  conditions jsonb not null default '{"op":"and","rules":[]}'::jsonb,
  lead_count integer not null default 0,
  last_calculated_at timestamptz null,
  campaign_id uuid null references public.sales_discovery_campaigns(id) on delete set null,
  email_sequence_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_discovery_segment_memberships (
  segment_id uuid not null references public.sales_discovery_segments(id) on delete cascade,
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  reason text null,
  created_at timestamptz not null default now(),
  primary key (segment_id, lead_id)
);

-- Email sequences (Phase 5)
create table if not exists public.sales_email_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  sender text null,
  timezone text not null default 'Asia/Jerusalem',
  daily_limit integer not null default 40,
  manual_approval boolean not null default true,
  auto_start boolean not null default false,
  stop_on_reply boolean not null default true,
  stop_on_bounce boolean not null default true,
  stop_on_unsubscribe boolean not null default true,
  stop_on_dnc boolean not null default true,
  mode text not null default 'manual_approval'
    check (mode in (
      'fully_automatic','manual_approval','high_potential_only','verified_email_only'
    )),
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_email_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sales_email_sequences(id) on delete cascade,
  step_index integer not null default 0,
  delay_days integer not null default 0,
  subject text not null,
  body text not null,
  template_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_email_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sales_email_sequences(id) on delete cascade,
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  status text not null default 'pending_approval'
    check (status in (
      'pending_approval','active','paused','stopped','completed','bounced','unsubscribed','replied'
    )),
  current_step integer not null default 0,
  next_send_at timestamptz null,
  approved_at timestamptz null,
  stopped_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, lead_id)
);

create table if not exists public.sales_email_sequence_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.sales_email_sequence_enrollments(id) on delete cascade,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Settings + logs + daily stats
create table if not exists public.sales_discovery_settings (
  id text primary key default 'default',
  daily_qualified_target integer not null default 10,
  groq_enabled boolean not null default true,
  groq_model text not null default 'llama-3.3-70b-versatile',
  groq_daily_request_limit integer not null default 14400,
  groq_requests_used_today integer not null default 0,
  groq_usage_day date null,
  groq_last_success_at timestamptz null,
  groq_last_error_at timestamptz null,
  groq_last_error_message text null,
  force_rules_only boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_discovery_settings_singleton check (id = 'default')
);

insert into public.sales_discovery_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.sales_discovery_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info'
    check (level in ('info','warn','error')),
  event text not null,
  campaign_id uuid null,
  lead_id uuid null,
  run_id uuid null,
  job_id uuid null,
  source text null,
  provider text null,
  model text null,
  error_code text null,
  message text not null,
  technical_details jsonb null,
  retry_count integer null,
  created_at timestamptz not null default now()
);

create index if not exists sales_discovery_logs_created_idx
  on public.sales_discovery_logs (created_at desc);

create table if not exists public.sales_discovery_daily_stats (
  day date primary key,
  discovered integer not null default 0,
  qualified integer not null default 0,
  rejected integer not null default 0,
  duplicates integer not null default 0,
  size_fail integer not null default 0,
  insufficient_data integer not null default 0,
  added_to_pipeline integer not null default 0,
  emails_sent integer not null default 0,
  replies integer not null default 0,
  meetings integer not null default 0,
  won integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Extend lead source check if present (best-effort; ignore if constraint name differs)
do $$
begin
  alter table public.sales_leads drop constraint if exists sales_leads_source_check;
exception when undefined_object then
  null;
end $$;

do $$
begin
  alter table public.sales_leads
    add constraint sales_leads_source_check
    check (source in ('manual', 'import', 'meta', 'wordpress', 'discovery'));
exception when duplicate_object then
  null;
end $$;
