-- Allow wordpress as lead source (WPForms webhook intake)
alter table public.sales_leads drop constraint if exists sales_leads_source_check;
alter table public.sales_leads add constraint sales_leads_source_check
  check (source in ('manual', 'import', 'meta', 'wordpress'));

create index if not exists sales_leads_wpforms_submission_id_idx
  on public.sales_leads ((custom_fields->>'wpforms_submission_id'))
  where custom_fields ? 'wpforms_submission_id';
