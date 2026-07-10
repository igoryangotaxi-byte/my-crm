# WordPress form → Sales Operation pipeline

Leads from the business forms on [appli.taxi](https://appli.taxi/) are created in the Sales Operation pipeline with status **New** (`source: wordpress`).

## Source forms

| Page | Nav from homepage | Form | Form ID |
|------|-------------------|------|---------|
| [yango_business-israel](https://appli.taxi/yango_business-israel/) | **לעסקים** | טופס עסקים | `43265f5` |
| [business](https://appli.taxi/business/) | (direct / ads) | yango-business | `b99e489` |

There is **no form on the homepage itself** — the business CTA goes to `/yango_business-israel/`.

## What delivers leads

**Appli CRM Form Bridge** (WordPress plugin on appli.taxi, v1.1+) is the source of truth.  
It hooks `elementor_pro/forms/new_record` for the two forms above and POSTs to the CRM webhook with `X-Webhook-Secret`.

Uncanny Automator recipes 1485 / 1492 exist as backup but their webhook actions should stay **draft** to avoid duplicate leads.

## Root causes that blocked leads (fixed 2026-07-10)

| Issue | Fix |
|-------|-----|
| Automator webhook action was **draft** | Published via `POST /wp-json/uap/v2/change_post_status` with `{"post_ID":1496,"post_status":"publish"}` |
| Elementor form action called a dead **Zapier** webhook and failed the whole submit | Removed `webhook` from form `submit_actions` (kept `save-to-database` + `redirect`) |
| Wrong form ID in older recipes | Recipe 1492 listens to `b99e489` |

## Prerequisites (CRM)

1. Apply Sales Operation schema (`scripts/sql/supabase_sales_operation.sql`).
2. If needed: `scripts/sql/supabase_sales_operation_wordpress_source.sql`
3. Set `SALES_OPERATION_WPFORMS_WEBHOOK_SECRET` in Vercel (Production + Development).

## Webhook API

`POST https://applitaxi.space/api/sales-operation/webhooks/wpforms`

| Header | Value |
|--------|--------|
| `X-Webhook-Secret` | Same as `SALES_OPERATION_WPFORMS_WEBHOOK_SECRET` |
| `Content-Type` | `application/json` |

Required body field: `fullName` (or `name` / `first_name`+`last_name`).  
Optional: `email`, `phone`, `companyName`, `formId`, `submissionId` (idempotency), campaign/UTM fields.

### Responses

- `201` — new lead (`duplicate: false`)
- `200` — same `submissionId` already exists (`duplicate: true`)
- `400` / `401` / `503` — validation / auth / secret missing

## Smoke test

```bash
curl -sS -X POST "https://applitaxi.space/api/sales-operation/webhooks/wpforms" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{"fullName":"Test Lead","email":"test@example.com","phone":"+972500000000","submissionId":"manual-test-1"}'
```

Then open `/sales-operation/pipeline` → lead in **New**.

Live form test: submit on `/business/` → thank-you redirect → same pipeline column.
