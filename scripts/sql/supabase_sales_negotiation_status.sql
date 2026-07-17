-- Add "negotiation" pipeline status between proposal_sent and signed.
-- Additive & idempotent. Until this runs, the app stores negotiation as
-- in_progress + a custom_fields._pipelineStatus override (compat layer).

alter table public.sales_leads drop constraint if exists sales_leads_status_check;
alter table public.sales_leads
  add constraint sales_leads_status_check
  check (status in ('new', 'in_progress', 'proposal_sent', 'negotiation', 'signed', 'rejected'));

alter table public.sales_lead_status_events drop constraint if exists sales_lead_status_events_from_status_check;
alter table public.sales_lead_status_events
  add constraint sales_lead_status_events_from_status_check
  check (from_status is null or from_status in ('new', 'in_progress', 'proposal_sent', 'negotiation', 'signed', 'rejected'));

alter table public.sales_lead_status_events drop constraint if exists sales_lead_status_events_to_status_check;
alter table public.sales_lead_status_events
  add constraint sales_lead_status_events_to_status_check
  check (to_status in ('new', 'in_progress', 'proposal_sent', 'negotiation', 'signed', 'rejected'));
