-- MOT transcript tariffs for Price Calculator → Transcripts tab.
-- Run in Supabase SQL editor (or psql) after deploy. App falls back to embedded catalog if empty / not configured.

create table if not exists public.transcript_mot_tariffs (
  code text primary key,
  label text not null,
  rules jsonb not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_transcript_mot_tariffs_sort on public.transcript_mot_tariffs (sort_order);

insert into public.transcript_mot_tariffs (code, label, rules, sort_order) values
  ('Main-ISR-2023-MOT', 'Main-ISR-2023-MOT', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":58.9,"perKm":5.9}}]}'::jsonb, 1),
  ('SPECIAL_MOT_MONE_AlonDaniel', 'SPECIAL_MOT_MONE_AlonDaniel', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":45,"perKm":4}}]}'::jsonb, 2),
  ('SPECIAL_MOT_MONE_Hyundai', 'SPECIAL_MOT_MONE_Hyundai', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":53.1,"perKm":4.13}}]}'::jsonb, 3),
  ('SPECIAL_MOT_MONE_ISRAYOM', 'SPECIAL_MOT_MONE_ISRAYOM', '{"version":1,"segments":[{"wrap":false,"fromHour":6,"fromMinute":0,"toHour":21,"toMinute":0,"model":{"type":"tiered_km","base":54,"firstKm":10,"rateFirst":5.31,"rateAfter":7.08}},{"wrap":true,"fromHour":21,"fromMinute":1,"toHour":5,"toMinute":59,"model":{"type":"linear","base":54,"perKm":5.9}}]}'::jsonb, 4),
  ('SPECIAL_MOT_MONE_SAMELET', 'SPECIAL_MOT_MONE_SAMELET', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"tiered_km","base":58.9,"firstKm":10,"rateFirst":5.9,"rateAfter":7.08}}]}'::jsonb, 5),
  ('SPECIAL_MOT_MONE_Shevat_Achim', 'SPECIAL_MOT_MONE_Shevat_Achim', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":48.84,"perKm":4.72}}]}'::jsonb, 6),
  ('SPECIAL_MOT_MONE_SHIRUTNIKAYON', 'SPECIAL_MOT_MONE_SHIRUTNIKAYON', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":47.2,"perKm":4.72}}]}'::jsonb, 7),
  ('SPECIAL_MOT_MONE_Shufersal', 'SPECIAL_MOT_MONE_Shufersal', '{"version":1,"segments":[{"wrap":false,"fromHour":5,"fromMinute":0,"toHour":15,"toMinute":0,"model":{"type":"linear","base":50,"perKm":5.4}},{"wrap":true,"fromHour":15,"fromMinute":1,"toHour":4,"toMinute":59,"model":{"type":"linear","base":50,"perKm":4.5}}]}'::jsonb, 8),
  ('SPECIAL_MOT_MONE_Yahav', 'SPECIAL_MOT_MONE_Yahav', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":53.1,"perKm":5.31}}]}'::jsonb, 9),
  ('SPECIAL_MOT_MONE_YangoDeli', 'SPECIAL_MOT_MONE_YangoDeli', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":47.2,"perKm":5.428}}]}'::jsonb, 10),
  ('SPECIAL_MOT_MONE_ZHAK', 'SPECIAL_MOT_MONE_ZHAK', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"tiered_km","base":54,"firstKm":10,"rateFirst":5.9,"rateAfter":7.08}}]}'::jsonb, 11),
  ('Main-ISR-2023-MOT_Summit_B2B', 'Main-ISR-2023-MOT_Summit_B2B', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":53.1,"perKm":5.9}}]}'::jsonb, 12),
  ('Main-ISR-2023-MOT_VIP_B2B', 'Main-ISR-2023-MOT_VIP_B2B', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":47.2,"perKm":5.9}}]}'::jsonb, 13),
  ('Main-ISR-2023-MOT_SUPER_VIP_B2B', 'Main-ISR-2023-MOT_SUPER_VIP_B2B', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":41.3,"perKm":5.9}}]}'::jsonb, 14),
  ('Main-ISR-2023-MOT_PRIME_B2B', 'Main-ISR-2023-MOT_PRIME_B2B', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":29.5,"perKm":5.9}}]}'::jsonb, 15),
  ('2271496/21.Public_MOT_lower', '2271496/21.Public_MOT_lower', '{"version":1,"segments":[{"wrap":false,"fromHour":0,"fromMinute":0,"toHour":23,"toMinute":59,"model":{"type":"linear","base":43.29,"perKm":5.34}}]}'::jsonb, 16)
on conflict (code) do update set
  label = excluded.label,
  rules = excluded.rules,
  sort_order = excluded.sort_order,
  updated_at = now();
