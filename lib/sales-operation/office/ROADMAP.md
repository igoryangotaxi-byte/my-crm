# 3D Office — deferred roadmap (phases 3–8)

MVP (phases 1–2) is implemented under `/sales-operation/office`.

## Phase 3 — Navigation polish
- Click-to-walk nav grid (Claw3D-style)
- Camera focus on selected CRM entity
- Receptionist notification cues from `/notifications`

## Phase 4 — AI avatars + actions
- Expand `POST /api/sales-operation/office/intent` with Groq/OpenAI structured actions
- Voice via Web Speech API
- Guided office tour (`officeTour` flag)

## Phase 5 — Contextual help + feedback
- Dwell timers near hotspots
- Post-feature prompts → existing `/api/feedback`

## Phase 6 — Perf depth
- Lazy room chunks, LOD, occlusion, texture streaming

## Phases 7–8 — UX validation + selective depth
- Timed scenarios vs classic UI
- Marketing lines, Support wall, Meeting table, CEO floor, ambient gamification lighting

Do not introduce OpenClaw Gateway or a parallel CRM data store.
