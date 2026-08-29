-- Per pre-order operator contact marks (Controller "Driver confirmed").

create table if not exists public.preorder_operator_marks (
  token_label text not null,
  client_id text not null,
  order_id text not null,
  contact_status text not null default 'none',
  marked_by_user_id text null,
  marked_by_name text null,
  marked_at timestamptz null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (token_label, client_id, order_id),
  constraint preorder_operator_marks_status_chk check (
    contact_status in ('none', 'driver_confirmed', 'no_answer', 'issue')
  )
);

create index if not exists preorder_operator_marks_marked_at_idx
  on public.preorder_operator_marks (marked_at desc nulls last);

comment on table public.preorder_operator_marks is
  'Controller marks: who contacted the driver / confirmation status for a Yango pre-order.';
