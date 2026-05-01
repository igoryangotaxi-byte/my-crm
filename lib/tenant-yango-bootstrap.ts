import {
  detectYangoDefaultCostCenterId,
  listYangoCostCenters,
} from "@/lib/yango-api";

/** Optional JSON map of Yango park `client_id` → default cost center id (deploy-time pin). */
let cachedEnvPins: Record<string, string> | null = null;

export function parseYangoPinnedCostCenterByClientIdFromEnv(): Record<string, string> {
  if (cachedEnvPins) return cachedEnvPins;
  const raw = process.env.YANGO_PINNED_COST_CENTER_JSON?.trim();
  if (!raw) {
    cachedEnvPins = {};
    return cachedEnvPins;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k.trim()] = v.trim();
      }
      cachedEnvPins = out;
      return cachedEnvPins;
    }
  } catch {
    // ignore invalid JSON
  }
  cachedEnvPins = {};
  return cachedEnvPins;
}

/**
 * Single source of truth for “what is the tenant default cost center in Yango?”:
 * first directory user with a non-empty cost center; optional prefetched GET cost_centers
 * (single id wins immediately); then detect API; then first prefetched or listed center.
 */
export async function discoverYangoTenantDefaultCostCenterId(input: {
  tokenLabel: string;
  apiClientId: string;
  yangoUsers?: Array<{ costCenterId?: string | null }>;
  /** When already fetched in parallel with /2.0/users — avoids a duplicate list call. */
  prefetchedCostCenters?: Array<{ id: string }>;
}): Promise<string> {
  const users = input.yangoUsers;
  if (users && users.length > 0) {
    for (const u of users) {
      const cc = (u.costCenterId ?? "").trim();
      if (cc) return cc;
    }
  }
  const pref = (input.prefetchedCostCenters ?? [])
    .map((c) => (c.id ?? "").trim())
    .filter(Boolean);
  if (pref.length === 1) {
    return pref[0];
  }
  const fromDetect = await detectYangoDefaultCostCenterId({
    tokenLabel: input.tokenLabel,
    clientId: input.apiClientId,
  }).catch(() => null);
  if (fromDetect?.trim()) return fromDetect.trim();
  if (pref.length > 0) {
    return pref[0];
  }
  const centers = await listYangoCostCenters({
    tokenLabel: input.tokenLabel,
    clientId: input.apiClientId,
  }).catch(() => []);
  return centers[0]?.id?.trim() || "";
}

/**
 * Resolve a default cost center when KV has no tenant default yet: optional tenant pin,
 * optional deploy env map (`YANGO_PINNED_COST_CENTER_JSON`), then Yango discovery without prefetch.
 */
export async function resolveDefaultCostCenterIdForYangoClient(input: {
  tokenLabel: string;
  apiClientId: string;
  pinnedCostCenterId?: string | null;
}): Promise<string> {
  const fromTenant = (input.pinnedCostCenterId ?? "").trim();
  if (fromTenant) return fromTenant;
  const envMap = parseYangoPinnedCostCenterByClientIdFromEnv();
  const fromEnv = envMap[input.apiClientId]?.trim();
  if (fromEnv) return fromEnv;
  return discoverYangoTenantDefaultCostCenterId({
    tokenLabel: input.tokenLabel,
    apiClientId: input.apiClientId,
  });
}
