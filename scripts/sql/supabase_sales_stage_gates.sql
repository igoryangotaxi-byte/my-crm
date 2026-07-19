-- Sales Operation — Stage gate fields on leads (additive).

alter table public.sales_leads
  add column if not exists pricing_proposal text null;

alter table public.sales_leads
  add column if not exists pricing_amount numeric null;

alter table public.sales_leads
  add column if not exists contract_number text null;

alter table public.sales_leads
  add column if not exists corp_client_id text null;
