# Auth permission KV cache (read path)

## Idle Sales Operation tab — auth-store `kv.get` budget (prod fallback)

Each API call that invokes `loadAuthStore()` may read KV once (30s in-process coalescing per instance). Estimates below count **KV GET equivalents** from auth-store loads only — not Yango token registry, fleet/drivers-map snapshot KV, request-rides address keys, or pre-orders/orders traffic (**Pre-Orders / Orders: untouched — 0 files changed** vs `main` in PR A). Optional fleet KV throttle is a separate low-priority PR C.

Assumptions: one warm Node instance, `AUTH_KV_SNAPSHOT_TTL_MS` = 30s, single `loadAuthStore()` per access check after PR A.

| Source | **`main@cd0d5424`** | **Linked operator (PR A)** | **Unlinked / idle poll (PR A)** |
|--------|---------------------|----------------------------|----------------------------------|
| `GET /api/auth` poll (10s → 60s visible; 2 loads → 1) | **720/h** | **~60/h** (~4 KV GET/h with cache) | same when tab visible; **0** when hidden (poll paused) |
| Call Center `/participants` (2s when linked; 2 loads → 1) | **3,600/h** | **~120/h** KV GET/h (2s poll, 30s cache); **runs when tab hidden** | **~12/h** HTTP rechecks (5 min + focus); **~1/h** KV GET |
| Telephony `/live` (2s when linked; 2 → 1 load) | **3,600/h** if enabled | **~120/h** KV GET if linked + hidden OK | **~12/h** rechecks; **~1/h** KV GET when unlinked |
| Bell / Appli tokens / misc SO (~60s polls, 2 → 1 load) | **~300/h** | **~150/h** HTTP; **~10/h** KV GET | same |
| **Typical SO tab (Call Center linked, telephony off, visible)** | **~4,620/h** HTTP loads → **~2,100/h** KV GET | **~450/h** HTTP → **~130/h** KV GET (~**94%** KV ↓ vs main) | — |
| **Typical SO tab (not linked to 3CX, visible)** | **~4,620/h** | — | **~90/h** HTTP → **~8/h** KV GET |

## Fail-closed (PR B)

- **Canonical store** on production fallback: Supabase Auth user metadata + global KV snapshot `appli:auth:store:v1`.
- **In-process cache TTL:** `AUTH_KV_SNAPSHOT_TTL_MS` (30 seconds). **`MAX_STALE_MS`** (10 minutes) for last-good snapshot after KV read failure — no `createDefaultStore()` on KV error.
- **`/api/auth` responses:** `Cache-Control: no-store`. **503 `PERMISSION_STORE_UNAVAILABLE`** vs **403 `PERMISSION_DENIED`**; client banner / `PermissionStoreUnavailableState`, no logout on 503, single retry.
- **Saves:** managed Supabase Auth user **deletions** skipped unless KV loaded successfully in the request (PR A guard).
