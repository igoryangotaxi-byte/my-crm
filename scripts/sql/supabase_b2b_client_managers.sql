-- B2B client manager assignments + sales client corp link

alter table public.gp_corp_client_map
  add column if not exists account_manager_user_id text null,
  add column if not exists account_manager_name text null,
  add column if not exists sales_manager_user_id text null,
  add column if not exists sales_manager_name text null;

create index if not exists gp_corp_client_map_account_manager_idx
  on public.gp_corp_client_map (account_manager_user_id);

create index if not exists gp_corp_client_map_sales_manager_idx
  on public.gp_corp_client_map (sales_manager_user_id);

alter table public.sales_clients
  add column if not exists corp_client_id text null,
  add column if not exists pending_sales_manager_user_id text null,
  add column if not exists pending_sales_manager_name text null;

create unique index if not exists sales_clients_corp_client_id_uidx
  on public.sales_clients (corp_client_id)
  where corp_client_id is not null;
