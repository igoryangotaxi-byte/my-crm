-- Sales Operation — Phase 6: in-app notifications per user.
-- Additive: dedicated table; delivery is best-effort from app code.

create table if not exists public.sales_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null,
  title text not null,
  body text null,
  lead_id uuid null references public.sales_leads (id) on delete cascade,
  link text null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sales_notifications_user_idx
  on public.sales_notifications (user_id, is_read, created_at desc);
