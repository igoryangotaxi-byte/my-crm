# Export CRM user permissions (read-only)

Use before P0-5 (legacy API RBAC) to verify operators have `orders`, `requestRides`, and `preOrders` where needed.

## Requirements

`.env.local` with Supabase admin access (same vars as the app):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional KV compare (read-only `GET` only):

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

The script **never** calls `loadAuthStore`, `loadAuthStoreFromSupabase`, or any `ensure*` / upsert / delete. It fails with a non-zero exit and a clear message if Supabase is missing or a query fails.

## Run

```bash
npx tsx scripts/export-user-permissions.ts
```

Optional KV comparison (errors are reported in JSON; Supabase export still prints):

```bash
npx tsx scripts/export-user-permissions.ts --compare-kv
```

Output: JSON with `meta` and `users[]` (no passwords, tokens, or B2C secrets).
