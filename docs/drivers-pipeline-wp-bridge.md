# Drivers Pipeline — WordPress form → CRM

Driver recruitment leads land in **Drivers Pipeline** (`/sales-operation/drivers-pipeline`) with status **New** (`source: wordpress`).

## Source form

| Page | Form name | Elementor form id |
|------|-----------|-------------------|
| [טופס הצטרפות למערך הנהגים](https://appli.taxi/טופס-הצטרפות-למערך-הנהגים-של-יאנגו/) | טופס הצטרפות למערך הנהגים | `3684f71` |

Fields: name, email, phone (+ marketing checkbox).

## What delivers leads

**Appli CRM Form Bridge** on appli.taxi (v1.2+) hooks `elementor_pro/forms/new_record` for the driver form and POSTs to:

`POST https://applitaxi.space/api/sales-operation/webhooks/drivers`

with header `X-Webhook-Secret: <DRIVERS_PIPELINE_WEBHOOK_SECRET>`.

### Cutover from Google Sheets

Previously submissions were written to [AppliTaxi Drivers Leads](https://docs.google.com/spreadsheets/d/1bpvCAqSXsfhbJxtXbsF8hfvWbVJWXFjdy7KnkllDRwc) sheet **Form (Don't touch)** (Elementor Google Sheets action). After cutover:

1. Deploy CRM webhook + set `DRIVERS_PIPELINE_WEBHOOK_SECRET` on Vercel.
2. Update Form Bridge plugin (see [`wordpress/appli-crm-bridge/appli-crm-bridge.php`](../wordpress/appli-crm-bridge/appli-crm-bridge.php)) — include form id `3684f71`.
3. In Elementor → form → Actions After Submit: **remove Google Sheets**; keep save-to-database / redirect.
4. Smoke-test a submit → lead appears in **New** on Drivers Pipeline; Sheet row count should not increase.

## CRM prerequisites

1. Apply SQL: [`scripts/sql/supabase_driver_leads.sql`](../scripts/sql/supabase_driver_leads.sql) (or `npm run db:apply:sales-operation`).
2. Env: `DRIVERS_PIPELINE_WEBHOOK_SECRET` (Production + Preview as needed).
3. RBAC page key: `salesDriversPipeline` (permissions version 19).

## Webhook API

| Header | Value |
|--------|--------|
| `X-Webhook-Secret` | Same as `DRIVERS_PIPELINE_WEBHOOK_SECRET` |
| `Content-Type` | `application/json` |

Required: `fullName` (or `name`). Optional: `email`, `phone`, `formId`, `submissionId` (idempotency), campaign/UTM in body or `customFields`.

### Responses

- `201` — new lead
- `200` — duplicate `submissionId`
- `400` / `401` / `503` — validation / auth / secret missing

## Smoke test

```bash
curl -sS -X POST "https://applitaxi.space/api/sales-operation/webhooks/drivers" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{"fullName":"Test Driver","email":"test@example.com","phone":"+972500000000","submissionId":"drivers-manual-test-1"}'
```

Open `/sales-operation/drivers-pipeline` → lead in **New**.

## Cutover checklist (appli.taxi)

1. Apply SQL `scripts/sql/supabase_driver_leads.sql` in Supabase (or `npm run db:apply:sales-operation`).
2. Set Vercel env `DRIVERS_PIPELINE_WEBHOOK_SECRET` (Production) to a long random hex; redeploy or wait for next deploy.
3. On WordPress, replace plugin file with [`wordpress/appli-crm-bridge/appli-crm-bridge.php`](../wordpress/appli-crm-bridge/appli-crm-bridge.php) (v1.2).
4. In `wp-config.php` (recommended) define both secrets:

```php
define('APPLI_DRIVERS_PIPELINE_WEBHOOK_SECRET', 'same-as-vercel');
// Keep existing B2B secret via APPLI_SALES_WPFORMS_WEBHOOK_SECRET or option —
// do not remove the live B2B bridge without setting this first.
```

   Or: `update_option('appli_drivers_pipeline_webhook_secret', '…');` and `update_option('appli_sales_wpforms_webhook_secret', '…');`
5. Elementor → edit form on page 1179 → **Actions After Submit** → remove **Google Sheets**; keep database/redirect.
6. Smoke-test form submit → `/sales-operation/drivers-pipeline` New column.
7. One-shot history: `npm run migrate:drivers-sheet` (after SQL).

**Do not** commit webhook secrets into git. The repo plugin reads secrets from WP options / `wp-config` defines only.

## Sheet migration (historical)

```bash
npm run migrate:drivers-sheet -- --dry-run
npm run migrate:drivers-sheet
```

- `Registered` → Registered  
- empty Status → New  
- other Status → Rejected + substatus  
- no-license tab → **Rejected** + substatus `No license`
- Form answer `לא` / no-license → same (webhook)

```bash
npx tsx scripts/dedupe-driver-leads-by-phone.ts --apply
```
