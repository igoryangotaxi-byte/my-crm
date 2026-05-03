Appli Taxi Oz CRM built with Next.js App Router, TypeScript and Tailwind CSS.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. **Production parity (recommended before shipping or when localhost diverges from prod)**  
   Link the repo to your Vercel project once, then pull **Production** env into `.env.local` (same Supabase keys, `YANGO_TOKEN_*`, `KV_REST_*`, etc. as live prod):

```bash
npx vercel link
# optional: cp .env.local .env.local.bak
npm run env:pull:production
```

If Vercel Production omits some keys (empty Supabase or `YANGO_TOKEN_*`), restore non-empty values from a backup file:

```bash
cp .env.local .env.local.bak.$(date +%Y%m%d)
npm run env:merge-from-backup
```

Optional: `node scripts/merge-env-local-from-backup.mjs path/to/backup` — default is `.env.local.bak.20260501` if present, else the script errors. The merge fills only **empty** keys in `.env.local` from the backup and drops `YANGO_TOKEN_REGISTRY_PRECEDENCE=env` for prod parity.

**Single place for Yango API tokens (same KV as Notes onboarding / TEST CABINET):** tokens are stored in KV key `appli:yango:token-registry:v1`. To copy every non-empty `YANGO_TOKEN_*` from `.env.local` into that registry (use the same `KV_REST_*` as production): `npm run sync:yango-tokens-to-kv` (preview with `npx tsx scripts/sync-yango-env-tokens-to-kv.ts --dry-run`). Requires `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

`npm run env:pull:preview` pulls Preview env instead. Requires `vercel login` and access to the team/project.

3. **Or** create `.env.local` from the template and fill values by hand:

```bash
cp .env.example .env.local
```

4. Fill the Yango API tokens in `.env.local` (skip if you already ran `env:pull:production`):

```env
YANGO_TOKEN_COFIX=
YANGO_TOKEN_SHUFERSAL=
YANGO_TOKEN_APLI_TAXI_OZ=
# Optional: separate B2B token for TEST CABINET (defaults to YANGO_TOKEN_APLI_TAXI_OZ)
YANGO_TOKEN_TEST_CABINET=
YANGO_TOKEN_SHANA10=
YANGO_TOKEN_TEL_AVIV_MUNICIPALITY=
YANGO_TOKEN_YANGO_DELI=
YANGO_TOKEN_SHLAV=
YANGO_TOKEN_SAMLET_MOTORS=
YANGO_TOKEN_HAMOSHAVA_20=
YANGO_TOKEN_STAR_TAXI_POINT=
YANGO_TOKEN_OPTICITY=
YANGO_TOKEN_ZHAK=
# Optional: omit for prod parity (registry/KV wins over duplicate YANGO_TOKEN_*). Only set to force env:
# YANGO_TOKEN_REGISTRY_PRECEDENCE=env
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
# Optional: enables traffic-aware route optimization on Request Rides (Routes API v2)
GOOGLE_MAPS_API_KEY=
# SMS for rider + stop / destination passengers (Inforu)
INFORU_USERNAME=
INFORU_API_TOKEN=
INFORU_SENDER=AppliTaxi
# SMS is opt-in (omit or false until Inforu clears KYC): INFORU_SMS_ENABLED=true
```

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Why localhost matched prod after `env:pull:production`

- **Supabase**: same `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` as Production; getters **trim** whitespace so `isSupabaseConfigured()` matches reality.
- **KV** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`): same token registry reads as Production when you pulled prod env.
- **Yango merge**: static `getStaticTokenConfigs()` + KV `appli:yango:token-registry:v1` are merged by **normalized label** (one row per cabinet). Default **`YANGO_TOKEN_REGISTRY_PRECEDENCE=registry`** (omit the variable): when both env and KV supply a token for the same cabinet, **KV wins** — same order as historical production, safe for new releases. Set **`YANGO_TOKEN_REGISTRY_PRECEDENCE=env` only** if you deliberately use prod KV but **refuse** to put prod-equivalent tokens in env (off-parity dev mode).
- **Dashboard**: if Supabase is unreachable or misconfigured locally, metrics return **empty** instead of a 500 so you can still navigate; with a full prod pull this path should not trigger.

## Client cabinet onboarding (Yango)

New client cabinets are created from CRM **Notes → Add client by API token**: validate or resolve the token, optionally create an admin login, then save. That flow writes tenant accounts and users to KV and discovers the tenant **default cost center** using the same rules as employee sync (Yango user directory with CC → default-cost-center detection API → first listed cost center).

- **`upsertTenantAccount`** on `POST /api/auth` exists for programmatic/server bootstrap (integrations or scripts). It is **not** the primary UI path; operators should use Notes onboarding unless automation depends on the API action.
- **`YANGO_PINNED_COST_CENTER_JSON`** (optional): JSON object mapping Yango park `client_id` → cost center UUID when automatic discovery is not enough. Example: `{"1beae7f94af44ee596c2ca86ae0a3551":"0e65ab747fd849beac2c6ee22baff2ba"}`. Prefer fixing configuration in Yango; pins are for rare deploy-time overrides. Rare per-tenant overrides can also be stored in KV as `pinnedDefaultCostCenterId` on the tenant row (internal).
- **KV audit** when a cabinet behaves unlike TEST CABINET: compare `tokenLabel`, `apiClientId`, `corpClientId`, tenant `defaultCostCenterId`, and client users’ `costCenterId` in the auth store after onboarding or **Sync employees from Yango** (Access).

### Regression checks before release

1. TEST CABINET: place an order from main CRM, place an order from the client portal, add an employee from the cabinet.
2. New cabinet after full onboarding: repeat the same three flows.
3. Negative: no cost centers in Yango — onboarding shows a warning in Notes; cabinet employee creation returns a clear error instead of opaque failures.

### Backfill cost centers in KV (when cabinets fail only outside TEST / known-good tokens)

Requires production-parity `.env.local` (`KV_REST_*`, `YANGO_TOKEN_*` / registry). Same discovery as onboarding (`listYangoClientUsers`, `listYangoCostCenters`, `discoverYangoTenantDefaultCostCenterId`).

```bash
npm run sync:tenant-cost-centers -- --dry-run
npm run sync:tenant-cost-centers
```

Optional: `--tenant-id=<kv-tenant-id>`; `--overrides=./cc.json` with `{ "<tenant-id-or-apiClientId-or-corpClientId>": "<cost-center-uuid>" }` when Yango returns no centers until fixed in the park admin.

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

## Bulk upload (XLSX) on Request Rides

The `Request Rides` page can create many rides at once from an `.xlsx` file.

1. Pick an API client in the form (the same client is used for every row in the file).
2. After a client is selected, use `Upload XLSX (bulk)` in the client block (optional: `Sample` downloads an example `.xlsx`) and choose your spreadsheet.
3. Each row in the file is parsed, addresses are geocoded, and the result appears in the `Pending uploads` panel.
4. Review the rows, then click `Confirm and create N rides` to submit them sequentially.

Column layout (no header row required — a header row is auto-detected):

| Column | Purpose | Required | Notes |
| --- | --- | --- | --- |
| A | Date and time of the ride | yes | Excel date cell, ISO string, or `dd.mm.yyyy hh:mm` / `dd/mm/yyyy hh:mm` |
| B | Rider phone (Yango passenger user) | yes | Free-form, leading `'` and whitespace are stripped |
| C | Driver comment | no | Free text |
| D | Pickup (point A) | yes | Address text, can be Russian, English or Hebrew |
| E | Stop or destination | yes | If only D and E are present, E is the destination |
| F | Stop or destination | no | Up to 5 addresses total per row |
| G | Stop or destination | no | The last non-empty cell among D…H is the destination |
| H | Stop or destination | no | Cells between D and the last non-empty become "Stops along the way" |
| I–M | SMS phone aligned with each address D–H | no | Column I (pickup) is parsed but never receives SMS; J–M get an SMS at ride creation and at driver assignment |

Row will be marked `blocked` (and skipped on confirm) when:
- date is missing or unparseable;
- phone is missing;
- pickup is missing;
- only one address is present;
- one of the addresses cannot be geocoded.

When a row has 3+ geocoded addresses and `GOOGLE_MAPS_API_KEY` is configured, the address order is **auto-optimized for current traffic** (open TSP — pickup stays first, the remaining stops are reshuffled to the fastest order, the last point becomes the destination). The preview shows an `Optimized · saves Nm` badge for affected rows. Without the key, the bulk flow silently skips optimization.

See [docs/request-rides-bulk-upload-template.md](docs/request-rides-bulk-upload-template.md) for an example sheet.

## Route optimization (single ride)

On the Request Rides page, when there are 3 or more points (pickup + at least 2 stops/destination), an `Optimize order (traffic-aware)` card appears under the Route preview. It uses **Routes API v2** (`computeRouteMatrix` for traffic-aware durations between every pair, then `computeRoutes` for the polyline of the winning permutation). The result is presented as `Pickup → ... → ...` with an estimated saving in current traffic and `Apply` / `Dismiss` buttons. Pickup is always first. By default, intermediate stops and the final drop-off can reorder; optional **Keep final drop-off as in the form** fixes the destination (round trips).

Required env: `GOOGLE_MAPS_API_KEY` (server-only). Without it the form button surfaces an inline error and the bulk flow skips optimization silently.

The **Route preview** panel and map polyline use the same key when set: `/api/route-preview` uses **traffic-aware routing** only (`TRAFFIC_AWARE_OPTIMAL`) for distance, duration in current traffic, and per-leg speed coloring on the map — **no OSRM fallback** when `GOOGLE_MAPS_API_KEY` is set (errors surface in the UI). If the key is **missing**, preview still uses **OSRM** for local/dev.

### Routing access errors (`403`) / `PERMISSION_DENIED` / “ComputeRouteMatrix are blocked”

1. **Billing** — attach a billing account to the project (Routes API is paid after free tier).
2. **Enable API** — [APIs & Services → Library](https://console.cloud.google.com/apis/library) → search **Routes API** → **Enable** (one API covers route matrix + directions used here).
3. **Key restrictions** — Credentials → your key → **API restrictions** → either “Don’t restrict” for testing, or **Restrict key** and tick **Routes API** only (not only “Maps JavaScript API”).
4. **Application restrictions** — for server calls from Next.js use **None** or **IP addresses**, not **Websites** (referrers do not apply to `/api/*` server `fetch`).

## SMS (Inforu)

The **rider (Yango passenger) phone** plus optional phones on stops and the destination receive SMS at two moments (all valid numbers are deduped):

1. **Ride created** — on submit, recipients get `Hey, someone requested a pre-order on … with Yango. Be ready on time and have a nice trip.` (or the non-scheduled variant for immediate rides).
2. **Driver assigned** — when status polling sees the order transition into `driver_assigned`, recipients get `Hey, your driver is on the way <car model>, <plate>, <first name> <last name>.` Falls back gracefully when some fields are missing in the Yango payload.

SMS is sent server-side via the Inforu gateway (`POST https://api.inforu.co.il/SendMessageXml.ashx`). **Outbound SMS is gated by `INFORU_SMS_ENABLED`**: the app does **not** call Inforu unless this is set to `true` / `1` / `yes`, so you can avoid repeated API errors while **Unverified Account / KYC** still applies.

Configure:

- `INFORU_USERNAME` — Inforu account username.
- `INFORU_API_TOKEN` — API token from `Account Details → API Token`.
- `INFORU_SMS_ENABLED` — Must be `true` before any SMS is sent. Leave unset or `false` until Inforu clears API send for your account.
- `INFORU_SENDER` — Sender ID shown on the recipient’s phone: Inforu usually expects **Latin letters/digits** (≤11 letters or 14 digits), **pre-approved** in your Inforu account. Hebrew or arbitrary strings often return **InvalidSenderIdentification** (`-90`) until Inforu registers a matching sender for you. Defaults to `AppliTaxi` in code if unset.

**Unverified Account / KYC:** Inforu can still block SMS at the API even if the web portal looks normal. Ask Inforu support to enable **outbound SMS** for this API user; send them the exact error text, endpoint `https://api.inforu.co.il/SendMessageXml.ashx`, and **Customer ID + Username** from Account Details. Changing the sender name in this app does not clear an API-side KYC flag. After they confirm send is allowed, set `INFORU_SMS_ENABLED=true`.

When Inforu credentials are not set, or SMS is disabled, ride creation still works — SMS is skipped; a soft warning may appear under the form when send was expected but did not occur. Per-recipient send-once dedupe is persisted in `localStorage` so a hard reload + re-poll never resends.

The bulk XLSX layout is extended with optional phone columns I–M aligned to address columns D–H. See [docs/request-rides-bulk-upload-template.md](docs/request-rides-bulk-upload-template.md).

## Security

- Never commit `.env.local` or real API tokens.
- If tokens were previously in git history, rotate them in Yango before publishing repository.
- Set `AUTH_SESSION_SECRET` in every environment to sign server auth cookies.

## Deploy

Deploy with Vercel: [https://vercel.com/new](https://vercel.com/new)

**Production checklist (common gaps):**

- **`GOOGLE_MAPS_API_KEY`** — required for Request Rides **route preview** (traffic-aware) and **`/api/route-optimize`**. Without it, optimization returns an error and preview may fall back or fail depending on route. Add to **Production** (and Preview if needed) in Vercel env; enable **Routes API** + billing on the GCP project.
- **Orders / Pre-Orders for `User` role** — access is stored in Vercel KV (`KV_REST_*`). After deploy, the auth store auto-migrates to **permissions version 2** so B2B **Orders** and **Pre-Orders** stay on for operators with the `User` role; Admins can still change this under **Access management**.
