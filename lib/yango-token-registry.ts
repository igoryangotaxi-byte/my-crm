import { kv } from "@vercel/kv";

const YANGO_TOKEN_REGISTRY_KEY = "appli:yango:token-registry:v1";

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
        typeof row.crmClientName === "string" ? row.crmClientName : "",
      );
      const token = typeof row.token === "string" ? row.token.trim() : "";
      const createdAt =
        typeof row.createdAt === "string" && row.createdAt
          ? row.createdAt
          : new Date().toISOString();
      const updatedAt =
        typeof row.updatedAt === "string" && row.updatedAt
          ? row.updatedAt
          : createdAt;
      return { label, crmClientName, token, createdAt, updatedAt };
    })
    .filter((entry) => Boolean(entry.label && entry.crmClientName && entry.token));

  return { entries };
}

async function loadStore(): Promise<YangoTokenRegistryStore> {
  if (canUseKv()) {
    try {
      const raw = await kv.get<YangoTokenRegistryStore>(YANGO_TOKEN_REGISTRY_KEY);
      const normalized = normalizeStore(raw);
      if (!raw) {
        await kv.set(YANGO_TOKEN_REGISTRY_KEY, normalized);
      }
      return normalized;
    } catch {
      // Fall back to memory store.
    }
  }

  fallbackMemoryStore = normalizeStore(fallbackMemoryStore);
  return fallbackMemoryStore;
}

async function saveStore(store: YangoTokenRegistryStore): Promise<void> {
  const normalized = normalizeStore(store);
  if (canUseKv()) {
    try {
      await kv.set(YANGO_TOKEN_REGISTRY_KEY, normalized);
      return;
    } catch {
      // Fall back to memory store.
    }
  }
  fallbackMemoryStore = normalized;
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
