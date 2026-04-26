Appli Taxi Oz CRM built with Next.js App Router, TypeScript and Tailwind CSS.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create local env file from template:

```bash
cp .env.example .env.local
```

3. Fill the Yango API tokens in `.env.local`:

```env
YANGO_TOKEN_COFIX=
YANGO_TOKEN_SHUFERSAL=
YANGO_TOKEN_APLI_TAXI_OZ=
YANGO_TOKEN_SHANA10=
YANGO_TOKEN_TEL_AVIV_MUNICIPALITY=
YANGO_TOKEN_YANGO_DELI=
YANGO_TOKEN_SHLAV=
YANGO_TOKEN_SAMLET_MOTORS=
YANGO_TOKEN_HAMOSHAVA_20=
ENABLE_LOCAL_GREENPLUM_SYNC=false
GREENPLUM_SYNC_COMMAND=npm run sync:datagrip:run
DATAGRIP_CONNECTION_CHECK_COMMAND=npm run sync:datagrip:check
DATAGRIP_SYNC_COMMAND=npm run sync:datagrip:run
DATAGRIP_DATASOURCES_HISTORY_PATH=
DATAGRIP_DATASOURCE_UUID=
GREENPLUM_PASSWORD=
GREENPLUM_SSL_MODE=require
ENABLE_SYNC_AGG_EXECUTOR=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_SESSION_SECRET=
```

4. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Drivers Map persistence (important for production)

`/api/drivers-map` stores last known coordinates and status observations in Vercel KV.

- Required in Vercel Production/Preview:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
- Local development can run without KV (fallback to in-memory/local file), but behavior after refresh/cold start will not match production exactly.
- Before release, keep `KV_REST_*` configured in Vercel and run `npm run build`.

## Optional: DataGrip manual sync button

If you want to run DataGrip/Greenplum -> Supabase sync from the `Notes` page:

- Create a Supabase project and copy project keys to env.
- Set `ENABLE_LOCAL_GREENPLUM_SYNC=true`
- Set `DATAGRIP_DATASOURCES_HISTORY_PATH` to DataGrip `data_sources_history.xml` path
- Set `DATAGRIP_DATASOURCE_UUID` to your Greenplum data source UUID
- Set `GREENPLUM_PASSWORD` (stored locally only)
- Run SQL schema for Supabase once: `scripts/sql/supabase_dashboard_schema.sql`
- Use default commands:
  - `DATAGRIP_CONNECTION_CHECK_COMMAND=npm run sync:datagrip:check`
  - `DATAGRIP_SYNC_COMMAND=npm run sync:datagrip:run`
  - optional safety overlap: `B2B_SYNC_OVERLAP_HOURS=2`

Current script behavior:
- checks connection using DataGrip DSN settings and `GREENPLUM_PASSWORD`
- syncs `taxi_cdm_order_rls_geo.fct_order` incrementally by `_etl_processed_dttm` (with optional overlap)
- optional sync for `agg_executor_profile_daily_snp` when `ENABLE_SYNC_AGG_EXECUTOR=true`
- writes/updates data in Supabase tables via upsert and keeps sync cursor in `sync_state`

This is intended for local laptop usage with active VPN session and token access.

## Optional: trigger sync from production button

If you want to click sync in production and execute it from your VPN laptop:

1. In Vercel env set:
   - `ENABLE_LOCAL_GREENPLUM_SYNC=false`
   - `ENABLE_REMOTE_GREENPLUM_SYNC_REQUESTS=true`
2. On your local laptop (`.env.local`) set:
   - `ENABLE_REMOTE_GREENPLUM_SYNC_REQUESTS=true`
   - `DATAGRIP_CONNECTION_CHECK_COMMAND` and `DATAGRIP_SYNC_COMMAND`
   - Greenplum + Supabase credentials as before
3. Keep local worker running:

```bash
npm run sync:datagrip:worker
```

Flow:
- production button enqueues a `pending` request in `sync_runs` with source `remote_sync_request`
- local worker claims request, runs connection check and sync
- worker writes final request status (`success` / `failed`) and sync data lands in Supabase

## Security

- Never commit `.env.local` or real API tokens.
- If tokens were previously in git history, rotate them in Yango before publishing repository.
- Set `AUTH_SESSION_SECRET` in every environment to sign server auth cookies.

## Deploy

Deploy with Vercel: [https://vercel.com/new](https://vercel.com/new)
