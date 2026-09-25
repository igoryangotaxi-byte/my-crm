# Export CRM user permissions (read-only)

Use before P0-5 (legacy API RBAC) to verify operators have `orders`, `requestRides`, and `preOrders` where needed.

## Requirements

- `.env.local` with the same variables the app uses for auth (no new env names):
  - **Supabase (production path):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - **Optional KV compare:** `KV_REST_API_URL`, `KV_REST_API_TOKEN`

The script performs **zero writes** and does not print passwords, password hashes, B2C tokens, or API secrets.

## Run

From the repository root:

```bash
npx tsx scripts/export-user-permissions.ts
```

Optional: compare canonical load with the legacy KV blob (read-only):

```bash
npx tsx scripts/export-user-permissions.ts --compare-kv
```

Output is JSON on stdout: `meta` (store source, counts) and `users[]` with `id`, `email`, `name`, `role`, `approved`, and enabled `permissionKeys`.

## Canonical store (U5)

When Supabase env is set, `lib/auth-store.ts` loads and saves via Supabase CRM tables (`crm_user_profiles`, `crm_role_permissions`, …). KV is used only as a **fallback** when Supabase is unavailable or env is missing (see `loadAuthStore` / `saveAuthStore` in `lib/auth-store.ts`).
