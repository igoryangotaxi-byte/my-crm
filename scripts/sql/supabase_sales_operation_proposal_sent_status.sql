-- Add proposal_sent pipeline status between in_progress and signed

alter table public.sales_leads drop constraint if exists sales_leads_status_check;
alter table public.sales_leads
  add constraint sales_leads_status_check
  check (status in ('new', 'in_progress', 'proposal_sent', 'signed', 'rejected'));

alter table public.sales_lead_status_events drop constraint if exists sales_lead_status_events_from_status_check;
alter table public.sales_lead_status_events
  add constraint sales_lead_status_events_from_status_check
  check (from_status is null or from_status in ('new', 'in_progress', 'proposal_sent', 'signed', 'rejected'));

alter table public.sales_lead_status_events drop constraint if exists sales_lead_status_events_to_status_check;
alter table public.sales_lead_status_events
  add constraint sales_lead_status_events_to_status_check
  check (to_status in ('new', 'in_progress', 'proposal_sent', 'signed', 'rejected'));
