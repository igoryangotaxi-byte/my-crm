# 3CX Call Center + Bar Oz CRM Integration

## What each piece does

| Piece | Role |
|-------|------|
| Call Control (`THREECX_BASE_URL` / `CLIENT_ID` / `SECRET`) | CRM dials, answers, hangs up; **audio stays on 3CX Web Client / phone** |
| Bar Oz webhooks (`THREECX_CRM_WEBHOOK_SECRET`) | 3CX pushes Lookup / Add Contact / **Call Report** (with Recording URL) into CRM |

## 1. Server env

```bash
THREECX_BASE_URL=https://yandex-t.bar-oz.co.il:5001
THREECX_CLIENT_ID=...
THREECX_CLIENT_SECRET=...
THREECX_CRM_WEBHOOK_SECRET=long-random-secret
NEXT_PUBLIC_APP_URL=https://applitaxi.space
```

Apply SQL: [`scripts/sql/supabase_call_center.sql`](../scripts/sql/supabase_call_center.sql) (user settings + `call_center_calls`). No extra tables.

## 2. Bar Oz CRM template URLs (in 3CX)

Production host: **`https://applitaxi.space`**

Replace `SECRET` with `THREECX_CRM_WEBHOOK_SECRET`. Auth is **fail-closed**: missing secret → `503`; wrong/missing key → `401`.

Pass the secret as **`?key=SECRET`** (recommended in the URL below) **or** a header:

- `X-3CX-Webhook-Key: SECRET`
- `Authorization: Bearer SECRET`

### The three public HTTPS URLs

1. **Lookup By Phone** — `GET`  
   `https://applitaxi.space/api/integrations/3cx/lookup-by-phone?key=SECRET`  
   Query: `Phone` (or `phone` / `Number`). Hit → JSON contact. Miss → **`200` with empty body**.
2. **Create Contact Record** — `POST`  
   `https://applitaxi.space/api/integrations/3cx/add-contact?key=SECRET`  
   JSON or form body (`First_Name`, `Phone`, optional `Last_Name` / `Company` / `Email`). Duplicate `Phone` returns the existing contact. Response: `ID`, `First_Name`, `Last_Name`, `Company_Name`, `Email`, `Phone_Mobile`, `Contact_URL`.
3. **Call Report** — `POST`  
   `https://applitaxi.space/api/integrations/3cx/call-report?key=SECRET`  
   JSON or form body including `Phone`, `Agent`, `Duration`, `DateTime`, `Type`, optional `Recording URL`. Success → **`200` empty body**. Duplicate reports (same phone + agent + time + duration) are stored once; a later retry can fill in a missing recording URL.

`Contact_URL` opens the matching CRM card:

- Sales contact / lead → `https://applitaxi.space/sales-operation/pipeline?lead=<id>`
- Signed B2B client → `https://applitaxi.space/sales-operation/b2b-clients/<id>`
- Driver → `https://applitaxi.space/drivers-map?phone=<number>`

Phones are matched with Israel-aware normalization (`054…` / `+972…` / `972…`).

## 3. Recordings

1. Enable **call recording** on the 3CX PBX (otherwise `Recording URL` is empty).
2. After each call, 3CX posts Call Report → CRM stores the row and shows it under **Call history** in `/sales-operation/call-center` (**Asia/Jerusalem**).
3. Recording links follow PBX retention (PDF: ~90 days); CRM stores the URL, not a copy of the WAV.

## 4. Operator checklist

1. Open Call Center → save **extension** (+ device).
2. Keep **3CX Web Client** (or desk phone) registered for audio.
3. Set status **Available** so inbound **screen-pop** (right drawer, ~400px) opens with name, phone, entity type, last call, primary **Dial**, and **Open card**. Miss → «No contact» + Create.
4. **Dial a driver / customer:** labeled Dial (icon + text) on assigned-driver and customer cards. No phone → disabled + tooltip reason. Not a FAB; red only on the screen-pop primary Dial.
5. Call log on `/sales-operation/call-center`: dense rows (Asia/Jerusalem), filters for date / direction / agent. Click a row to screen-pop.
6. Dialer on the same page for an ad-hoc number; Answer / Decline stay in the screen-pop when ringing.

## 5. QA notes

| Case | Expect |
|------|--------|
| Lookup hit (`?key=` + known IL phone in any format) | `200` JSON with `ID`, `First_Name`, `Phone_Mobile`, `Contact_URL` |
| Lookup miss | `200` empty body |
| Lookup/create/report without key or wrong key | `401` (or `503` if env secret unset) |
| Create new phone | `200` JSON; `Contact_URL` opens pipeline lead |
| Create same phone again | `200` same `ID` (no duplicate) |
| Call Report | `200` empty body; row in Call history with recording URL if sent |
| Repeat Call Report | still one history row |
| Dial with no phone | Dial disabled + tooltip reason |
| Dial with phone | 3CX makecall only (no `tel:` / FaceTime fallback; link extension in Call Center if not linked) |
| Inbound screen-pop miss | «No contact» + Create |
| Call log | time (Asia/Jerusalem), direction, from/to, duration, agent, entity link |
