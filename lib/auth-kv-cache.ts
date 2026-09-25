import type { AuthStoreData } from "@/types/auth";
import { markAuthKvReadSucceededInRequest } from "@/lib/auth-kv-request-context";
import {
  MAX_STALE_MS,
  PermissionStoreUnavailableError,
} from "@/lib/permission-store-unavailable";

/** In-process TTL for coalescing KV snapshot reads (global store object only). */
export const AUTH_KV_SNAPSHOT_TTL_MS = 30_000;

type CacheEntry = {
  expiresAt: number;
  raw: AuthStoreData | null;
};

type LastGoodEntry = {
  fetchedAt: number;
  store: AuthStoreData;
};

let snapshotCache: CacheEntry | null = null;
let lastGoodSnapshot: LastGoodEntry | null = null;

export function invalidateAuthKvSnapshotCache(): void {
  snapshotCache = null;
}

export function resetAuthKvSnapshotCacheForTests(): void {
  snapshotCache = null;
  lastGoodSnapshot = null;
}

export function getLastGoodSnapshotForTests(): LastGoodEntry | null {
  return lastGoodSnapshot;
}

/**
 * Load the global KV auth snapshot for read paths (fail-closed). Never writes to KV.
 * On KV failure: serve last-good snapshot if younger than MAX_STALE_MS, else throw.
 */
export async function loadPermissionKvSnapshot(
  fetchRawFromKv: () => Promise<AuthStoreData | null>,
  normalize: (raw: AuthStoreData | null) => AuthStoreData,
): Promise<AuthStoreData> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) {
    markAuthKvReadSucceededInRequest();
    return normalize(snapshotCache.raw);
  }

  try {
    const raw = await fetchRawFromKv();
    const store = normalize(raw);
    snapshotCache = { expiresAt: now + AUTH_KV_SNAPSHOT_TTL_MS, raw };
    lastGoodSnapshot = { fetchedAt: now, store };
    markAuthKvReadSucceededInRequest();
    return store;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[auth] KV snapshot read failed: ${detail}`);
    if (lastGoodSnapshot && now - lastGoodSnapshot.fetchedAt <= MAX_STALE_MS) {
      console.warn("[auth] serving stale permission KV snapshot (within MAX_STALE_MS)");
      markAuthKvReadSucceededInRequest();
      return lastGoodSnapshot.store;
    }
    throw new PermissionStoreUnavailableError(
      `Permission KV snapshot unavailable: ${detail}`,
    );
  }
}

/**
 * PR A read path when fail-open is required: caches successful reads only; throws on KV error.
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
