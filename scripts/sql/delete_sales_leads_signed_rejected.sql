-- One-shot cleanup: remove all signed + rejected leads (and linked clients).
-- Notes / status events cascade from sales_leads.
-- sales_clients must go first (lead_id ON DELETE RESTRICT).
-- Safe to re-run (deletes 0 rows if none match).

begin;

-- Preview (optional — check Results before commit if running step-by-step)
-- select status, count(*) from public.sales_leads where status in ('signed', 'rejected') group by status;

delete from public.sales_clients
where lead_id in (
  select id from public.sales_leads where status in ('signed', 'rejected')
);

delete from public.sales_leads
where status in ('signed', 'rejected');

commit;
