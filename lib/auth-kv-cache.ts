import type { AuthStoreData } from "@/types/auth";
import { markAuthKvReadSucceededInRequest } from "@/lib/auth-kv-request-context";

/** In-process TTL for coalescing successful KV snapshot reads (global object only). */
export const AUTH_KV_SNAPSHOT_TTL_MS = 30_000;

type CacheEntry = {
  expiresAt: number;
  raw: AuthStoreData | null;
};

let snapshotCache: CacheEntry | null = null;

export function invalidateAuthKvSnapshotCache(): void {
  snapshotCache = null;
}

export function resetAuthKvSnapshotCacheForTests(): void {
  snapshotCache = null;
}

/**
 * Reads KV with 30s in-process cache. Only **successful** fetches update the cache.
 * On KV error: throws (caller keeps legacy fallback behavior). Does not cache errors.
 */
export async function fetchAuthKvSnapshotCached(
  fetchRawFromKv: () => Promise<AuthStoreData | null>,
): Promise<AuthStoreData | null> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) {
    markAuthKvReadSucceededInRequest();
    return snapshotCache.raw;
  }

  const raw = await fetchRawFromKv();
  snapshotCache = { expiresAt: now + AUTH_KV_SNAPSHOT_TTL_MS, raw };
  markAuthKvReadSucceededInRequest();
  return raw;
}
