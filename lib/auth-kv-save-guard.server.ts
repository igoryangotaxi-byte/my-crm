import { kv } from "@vercel/kv";
import type { AuthStoreData } from "@/types/auth";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";

const AUTH_STORE_KEY = "appli:auth:store:v1";

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export type FreshAuthKvReadForSave =
  | { ok: true; raw: AuthStoreData | null }
  | { ok: false; reason: "kv_not_configured" | "kv_read_failed" };

/**
 * Uncached KV read for save paths. Does not update the 30s read cache.
 * Saves must not treat a cache hit as proof KV is writable/current for this mutation.
 */
export async function readAuthKvSnapshotFreshForSave(): Promise<FreshAuthKvReadForSave> {
  if (!canUseKv()) {
    return { ok: false, reason: "kv_not_configured" };
  }
  try {
    const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
    return { ok: true, raw };
  } catch {
    return { ok: false, reason: "kv_read_failed" };
  }
}

export function permissionStoreUnavailableForSave(message?: string): never {
  throw new PermissionStoreUnavailableError(
    message ??
      "Permission store unavailable; changes were not saved and no Supabase Auth users were modified.",
  );
}

export function assertFreshKvReadableForStrictSave(fresh: FreshAuthKvReadForSave): void {
  if (!fresh.ok) {
    permissionStoreUnavailableForSave();
  }
}
