-- Sales Operation — Phase 5: file attachments per lead.
-- Additive: private storage bucket + metadata table.

-- Private bucket for lead attachments (access via short-lived signed URLs).
insert into storage.buckets (id, name, public)
values ('sales-attachments', 'sales-attachments', false)
on conflict (id) do nothing;

create table if not exists public.sales_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by_user_id text null,
  uploaded_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists sales_files_lead_id_idx
  on public.sales_files (lead_id, created_at desc);
