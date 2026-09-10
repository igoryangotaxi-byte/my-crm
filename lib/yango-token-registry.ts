import { kv } from "@vercel/kv";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

const YANGO_TOKEN_REGISTRY_KEY = "appli:yango:token-registry:v1";
const STORAGE_BUCKET = "sales-attachments";
const STORAGE_PATH = "system/yango-token-registry-v1.json";
const MEMORY_TTL_MS = 60_000;

type YangoTokenRegistryStore = {
  entries: YangoTokenRegistryEntry[];
};

export type YangoTokenRegistryEntry = {
  label: string;
  crmClientName: string;
  token: string;
  createdAt: string;
  updatedAt: string;
};

export type ExistingYangoTokenMatch = {
  source: "registry" | "env";
  label: string;
  clientName: string | null;
  envKey?: string;
};

let fallbackMemoryStore: YangoTokenRegistryStore = { entries: [] };
let memoryCache: { at: number; store: YangoTokenRegistryStore } | null = null;

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/** One key for static labels ("Star Taxi Point") and registry labels ("STAR_TAXI_POINT"). */
export function normalizeYangoTokenRegistryLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeClientName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeStore(input: unknown): YangoTokenRegistryStore {
  if (!input || typeof input !== "object") return { entries: [] };
  const rawEntries = Array.isArray((input as { entries?: unknown[] }).entries)
    ? ((input as { entries: unknown[] }).entries ?? [])
    : [];

  const entries = rawEntries
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => {
      const label = normalizeYangoTokenRegistryLabel(typeof row.label === "string" ? row.label : "");
      const crmClientName = normalizeClientName(
        typeof row.crmClientName === "string"
          ? row.crmClientName
          : typeof row.crm_client_name === "string"
            ? row.crm_client_name
            : "",
      );
      const token = typeof row.token === "string" ? row.token.trim() : "";
      const createdAt =
        typeof row.createdAt === "string" && row.createdAt
          ? row.createdAt
          : typeof row.created_at === "string" && row.created_at
            ? row.created_at
            : new Date().toISOString();
      const updatedAt =
        typeof row.updatedAt === "string" && row.updatedAt
          ? row.updatedAt
          : typeof row.updated_at === "string" && row.updated_at
            ? row.updated_at
            : createdAt;
      return { label, crmClientName, token, createdAt, updatedAt };
    })
    .filter((entry) => Boolean(entry.label && entry.crmClientName && entry.token));

  return { entries };
}

function mergeStores(...stores: YangoTokenRegistryStore[]): YangoTokenRegistryStore {
  const byLabel = new Map<string, YangoTokenRegistryEntry>();
  for (const store of stores) {
    for (const entry of store.entries) {
      const prev = byLabel.get(entry.label);
      if (!prev) {
        byLabel.set(entry.label, entry);
        continue;
      }
      // Prefer newer updatedAt; if equal keep existing.
      if (String(entry.updatedAt) > String(prev.updatedAt)) {
        byLabel.set(entry.label, entry);
      }
    }
  }
  return { entries: [...byLabel.values()] };
}

async function loadFromSupabaseTable(): Promise<YangoTokenRegistryStore | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from("yango_token_registry").select("*");
    if (error) {
      // Table may not exist yet.
      return null;
    }
    const entries = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        label: normalizeYangoTokenRegistryLabel(String(r.label ?? "")),
        crmClientName: normalizeClientName(String(r.crm_client_name ?? "")),
        token: String(r.token ?? "").trim(),
        createdAt: String(r.created_at ?? new Date().toISOString()),
        updatedAt: String(r.updated_at ?? new Date().toISOString()),
      };
    }).filter((e) => e.label && e.crmClientName && e.token);
    return { entries };
  } catch {
    return null;
  }
}

async function saveToSupabaseTable(store: YangoTokenRegistryStore): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = getSupabaseAdminClient();
    const rows = store.entries.map((e) => ({
      label: e.label,
      crm_client_name: e.crmClientName,
      token: e.token,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    }));
    // Upsert all; do not delete missing rows here (safer during partial restores).
    const { error } = await supabase.from("yango_token_registry").upsert(rows, { onConflict: "label" });
    return !error;
  } catch {
    return false;
  }
}

async function loadFromStorage(): Promise<YangoTokenRegistryStore | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_PATH);
    if (error || !data) return null;
    const text = await data.text();
    if (!text.trim()) return null;
    return normalizeStore(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

async function saveToStorage(store: YangoTokenRegistryStore): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = getSupabaseAdminClient();
    const body = JSON.stringify(store, null, 2);
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, body, {
      contentType: "application/json",
      upsert: true,
    });
    return !error;
  } catch {
    return false;
  }
}

async function loadFromKv(): Promise<YangoTokenRegistryStore | null> {
  if (!canUseKv()) return null;
  try {
    const raw = await kv.get<YangoTokenRegistryStore>(YANGO_TOKEN_REGISTRY_KEY);
    if (!raw) return null;
    return normalizeStore(raw);
  } catch {
    return null;
  }
}

async function saveToKvBestEffort(store: YangoTokenRegistryStore): Promise<void> {
  if (!canUseKv()) return;
  if (store.entries.length === 0) {
    // Never wipe a remote registry with an empty local snapshot.
    return;
  }
  try {
    await kv.set(YANGO_TOKEN_REGISTRY_KEY, store);
  } catch {
    // Quota / outage — durable stores already saved.
  }
}

async function loadStore(): Promise<YangoTokenRegistryStore> {
  if (memoryCache && Date.now() - memoryCache.at < MEMORY_TTL_MS) {
    return memoryCache.store;
  }

  const [tableStore, storageStore, kvStore] = await Promise.all([
    loadFromSupabaseTable(),
    loadFromStorage(),
    loadFromKv(),
  ]);

  const merged = mergeStores(
    fallbackMemoryStore,
    tableStore ?? { entries: [] },
    storageStore ?? { entries: [] },
    kvStore ?? { entries: [] },
  );

  fallbackMemoryStore = merged;
  memoryCache = { at: Date.now(), store: merged };

  // If KV is empty/unavailable but we have durable data, try to heal KV once.
  if (merged.entries.length > 0 && (!kvStore || kvStore.entries.length === 0)) {
    void saveToKvBestEffort(merged);
  }

  return merged;
}

async function saveStore(store: YangoTokenRegistryStore): Promise<void> {
  const normalized = normalizeStore(store);
  fallbackMemoryStore = normalized;
  memoryCache = { at: Date.now(), store: normalized };

  const [tableOk, storageOk] = await Promise.all([
    saveToSupabaseTable(normalized),
    saveToStorage(normalized),
  ]);
  if (!tableOk && !storageOk && normalized.entries.length === 0) {
    // Nothing durable available — keep memory only.
  }
  await saveToKvBestEffort(normalized);
}

export async function loadYangoTokenRegistry(): Promise<YangoTokenRegistryEntry[]> {
  const store = await loadStore();
  return store.entries;
}

export async function upsertYangoTokenRegistryEntry(input: {
  label: string;
  crmClientName: string;
  token: string;
}): Promise<YangoTokenRegistryEntry> {
  const label = normalizeYangoTokenRegistryLabel(input.label);
  const crmClientName = normalizeClientName(input.crmClientName);
  const token = input.token.trim();
  if (!label || !crmClientName || !token) {
    throw new Error("label, crmClientName and token are required.");
  }

  const store = await loadStore();
  const now = new Date().toISOString();
  const index = store.entries.findIndex((entry) => entry.label === label);
  const nextEntry: YangoTokenRegistryEntry =
    index >= 0
      ? {
          ...store.entries[index],
          crmClientName,
          token,
          updatedAt: now,
        }
      : {
          label,
          crmClientName,
          token,
          createdAt: now,
          updatedAt: now,
        };

  const nextEntries = [...store.entries];
  if (index >= 0) {
    nextEntries[index] = nextEntry;
  } else {
    nextEntries.push(nextEntry);
  }
  await saveStore({ entries: nextEntries });
  return nextEntry;
}

/** Replace entire registry (used by restore/sync tools). Never accepts empty. */
export async function replaceYangoTokenRegistry(
  entries: YangoTokenRegistryEntry[],
): Promise<YangoTokenRegistryStore> {
  const normalized = normalizeStore({ entries });
  if (normalized.entries.length === 0) {
    throw new Error("Refusing to replace registry with an empty entry list.");
  }
  await saveStore(normalized);
  return normalized;
}

export async function findExistingYangoToken(token: string): Promise<ExistingYangoTokenMatch | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) return null;

  const registryEntries = await loadYangoTokenRegistry();
  const fromRegistry = registryEntries.find((entry) => entry.token.trim() === normalizedToken);
  if (fromRegistry) {
    return {
      source: "registry",
      label: fromRegistry.label,
      clientName: fromRegistry.crmClientName,
    };
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("YANGO_TOKEN_")) continue;
    if ((value ?? "").trim() !== normalizedToken) continue;
    const suffix = key.replace(/^YANGO_TOKEN_/, "");
    return {
      source: "env",
      label: normalizeYangoTokenRegistryLabel(suffix || key),
      clientName: null,
      envKey: key,
    };
  }

  return null;
}
