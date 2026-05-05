import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import type { BussinessCenterPayload } from "@/lib/bussiness-center";

const CACHE_TABLE = "crm_bussiness_center_cache";
const CACHE_TTL_MS = Number(process.env.BUSSINESS_CENTER_CACHE_TTL_MS ?? "300000");

const memoryCache = new Map<string, { updatedAt: number; payload: BussinessCenterPayload }>();

function cacheKey(input: { tokenLabel: string; clientId: string; since: string; till: string }): string {
  return `${input.tokenLabel}:${input.clientId}:${input.since}:${input.till}`;
}

export async function loadBussinessCenterCache(input: {
  tokenLabel: string;
  clientId: string;
  since: string;
  till: string;
}): Promise<BussinessCenterPayload | null> {
  const key = cacheKey(input);
  const mem = memoryCache.get(key);
  const now = Date.now();
  if (mem && now - mem.updatedAt < CACHE_TTL_MS) return mem.payload;

  if (!isSupabaseConfigured()) return mem?.payload ?? null;
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from(CACHE_TABLE)
      .select("payload,updated_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data?.payload) return mem?.payload ?? null;
    const updatedAt = new Date(String(data.updated_at ?? "")).getTime();
    if (!Number.isFinite(updatedAt) || now - updatedAt > CACHE_TTL_MS) return mem?.payload ?? null;
    const payload = data.payload as BussinessCenterPayload;
    memoryCache.set(key, { updatedAt, payload });
    return payload;
  } catch {
    return mem?.payload ?? null;
  }
}

export async function saveBussinessCenterCache(
  input: { tokenLabel: string; clientId: string; since: string; till: string },
  payload: BussinessCenterPayload,
): Promise<void> {
  const key = cacheKey(input);
  const now = Date.now();
  memoryCache.set(key, { updatedAt: now, payload });
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from(CACHE_TABLE).upsert(
      {
        cache_key: key,
        token_label: input.tokenLabel,
        client_id: input.clientId,
        since_iso: input.since,
        till_iso: input.till,
        updated_at: new Date(now).toISOString(),
        payload,
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // cache best-effort only
  }
}
