-- Private bucket for Mind Map attachments (CRM uploads via service role API only)
insert into storage.buckets (id, name, public)
values ('mind-map-files', 'mind-map-files', false)
on conflict (id) do nothing;
