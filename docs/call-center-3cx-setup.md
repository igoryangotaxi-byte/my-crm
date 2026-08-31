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

Apply SQL: [`scripts/sql/supabase_call_center.sql`](../scripts/sql/supabase_call_center.sql) (user settings + `call_center_calls`).

## 2. Bar Oz CRM template URLs (in 3CX)

Replace `SECRET` with `THREECX_CRM_WEBHOOK_SECRET`:

- **Lookup By Phone (GET):**  
  `https://applitaxi.space/api/integrations/3cx/lookup-by-phone?key=SECRET`
- **Create Contact (POST):**  
  `https://applitaxi.space/api/integrations/3cx/add-contact?key=SECRET`
- **Call Report (POST):**  
  `https://applitaxi.space/api/integrations/3cx/call-report?key=SECRET`

## 3. Recordings

1. Enable **call recording** on the 3CX PBX (otherwise `Recording URL` is empty).
2. After each call, 3CX posts Call Report → CRM stores the row and shows it under **Call history** in `/sales-operation/call-center`.
3. Recording links follow PBX retention (PDF: ~90 days); CRM stores the URL, not a copy of the WAV.

## 4. Operator checklist

1. Open Call Center → save **extension** (+ device).
2. Keep **3CX Web Client** (or desk phone) registered for audio.
3. Set status **Available** to receive inbound toasts.
4. Use Dialer / driver **Call** icons for outbound; Answer on toast or Active call panel.
