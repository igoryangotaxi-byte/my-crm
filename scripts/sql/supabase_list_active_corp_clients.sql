-- Distinct corp clients with ≥1 successful trip since a given timestamp.
-- Used by Sales Operation Clients list (active B2B since 2026-01-01).

create or replace function public.list_active_corp_client_ids_since(since_ts timestamptz)
returns table (corp_client_id text)
language sql
stable
as $$
  select distinct lower(trim(o.corp_client_id)) as corp_client_id
  from public.gp_fct_order_raw o
  where o.corp_client_id is not null
    and o.success_order_flg is true
    and o.lcl_order_due_dttm >= since_ts;
$$;
