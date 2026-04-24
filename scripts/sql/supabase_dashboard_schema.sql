create table if not exists public.sync_state (
  source_name text primary key,
  last_success_at timestamptz not null
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  started_at timestamptz not null,
  finished_at timestamptz null,
  status text not null,
  rows_loaded integer not null default 0,
  from_ts timestamptz null,
  to_ts timestamptz null,
  error_text text null
);

create table if not exists public.gp_fct_order_raw (
  order_id text primary key,
  etl_processed_dttm timestamptz null,
  utc_order_created_dttm timestamptz null,
  lcl_order_due_dttm timestamptz null,
  utc_order_due_dttm timestamptz null,
  utc_order_finished_dttm timestamptz null,
  utc_setcar_dttm timestamptz null,
  utc_start_driving_dttm timestamptz null,
  utc_start_transporting_dttm timestamptz null,
  source_address text null,
  destination_plan_address text null,
  corp_client_id text null,
  park_client_id text null,
  park_client_name text null,
  corp_order_flg boolean null,
  corp_contract_id text null,
  corp_tariff_id text null,
  corp_tariff_plan_id text null,
  user_tariff_id text null,
  operational_class_code text null,
  tariff_class_code text null,
  success_order_flg boolean null,
  driver_status text null,
  user_status text null,
  paid_cancel_order_flg boolean null,
  cancel_reason_list jsonb null,
  request_payment_type text null,
  fact_payment_type text null,
  currency_code text null,
  currency_rate numeric null,
  user_w_vat_cost numeric null,
  driver_cost numeric null,
  order_cost numeric null,
  b2b_order_cost numeric null,
  order_wo_limit_cost numeric null,
  b2b_order_wo_limit_cost numeric null,
  order_before_surge_cost numeric null,
  b2b_order_before_surge_cost numeric null,
  decoupling_driver_cost numeric null,
  decoupling_user_cost numeric null,
  decoupling_flg boolean null,
  decoupling_success_flg boolean null,
  transporting_distance_fact_km numeric null,
  transporting_distance_plan_km numeric null,
  transporting_time_fact_mnt numeric null,
  transporting_time_plan_mnt numeric null,
  travel_time_mnt numeric null,
  order_completion_time_mnt numeric null
);

create index if not exists gp_fct_order_raw_etl_processed_idx
  on public.gp_fct_order_raw (etl_processed_dttm desc);

alter table public.gp_fct_order_raw add column if not exists utc_order_due_dttm timestamptz null;
alter table public.gp_fct_order_raw add column if not exists utc_order_finished_dttm timestamptz null;
alter table public.gp_fct_order_raw add column if not exists utc_setcar_dttm timestamptz null;
alter table public.gp_fct_order_raw add column if not exists utc_start_driving_dttm timestamptz null;
alter table public.gp_fct_order_raw add column if not exists utc_start_transporting_dttm timestamptz null;
alter table public.gp_fct_order_raw add column if not exists park_client_name text null;
alter table public.gp_fct_order_raw add column if not exists corp_order_flg boolean null;
alter table public.gp_fct_order_raw add column if not exists corp_contract_id text null;
alter table public.gp_fct_order_raw add column if not exists corp_tariff_id text null;
alter table public.gp_fct_order_raw add column if not exists corp_tariff_plan_id text null;
alter table public.gp_fct_order_raw add column if not exists user_tariff_id text null;
alter table public.gp_fct_order_raw add column if not exists operational_class_code text null;
alter table public.gp_fct_order_raw add column if not exists tariff_class_code text null;
alter table public.gp_fct_order_raw add column if not exists paid_cancel_order_flg boolean null;
alter table public.gp_fct_order_raw add column if not exists cancel_reason_list jsonb null;
alter table public.gp_fct_order_raw add column if not exists request_payment_type text null;
alter table public.gp_fct_order_raw add column if not exists fact_payment_type text null;
alter table public.gp_fct_order_raw add column if not exists currency_code text null;
alter table public.gp_fct_order_raw add column if not exists currency_rate numeric null;
alter table public.gp_fct_order_raw add column if not exists order_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists b2b_order_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists order_wo_limit_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists b2b_order_wo_limit_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists order_before_surge_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists b2b_order_before_surge_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists decoupling_user_cost numeric null;
alter table public.gp_fct_order_raw add column if not exists decoupling_flg boolean null;
alter table public.gp_fct_order_raw add column if not exists decoupling_success_flg boolean null;
alter table public.gp_fct_order_raw add column if not exists transporting_distance_fact_km numeric null;
alter table public.gp_fct_order_raw add column if not exists transporting_distance_plan_km numeric null;
alter table public.gp_fct_order_raw add column if not exists transporting_time_fact_mnt numeric null;
alter table public.gp_fct_order_raw add column if not exists transporting_time_plan_mnt numeric null;
alter table public.gp_fct_order_raw add column if not exists travel_time_mnt numeric null;
alter table public.gp_fct_order_raw add column if not exists order_completion_time_mnt numeric null;

create table if not exists public.gp_agg_executor_daily_raw (
  executor_profile_sk text not null,
  utc_business_dttm timestamptz not null,
  park_client_id text null,
  park_city_name text null,
  success_order_cnt integer null,
  total_order_cnt integer null,
  user_cost_rub numeric null,
  driver_income_rub numeric null,
  driver_net_income_incl_paid_cancel_rub_amt numeric null,
  subsidy_rub_value numeric null,
  order_commission_rub numeric null,
  primary key (executor_profile_sk, utc_business_dttm)
);

create index if not exists gp_agg_executor_daily_raw_business_idx
  on public.gp_agg_executor_daily_raw (utc_business_dttm desc);

create table if not exists public.gp_corp_client_map (
  corp_client_id text primary key,
  client_name text not null,
  source text null,
  updated_at timestamptz not null default now()
);

create index if not exists gp_corp_client_map_name_idx
  on public.gp_corp_client_map (client_name);

