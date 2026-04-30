import fs from "node:fs";
import path from "node:path";

type UserMapRoot = Record<string, Record<string, string>>;

const DEFAULT_MAP_PATH = path.join(process.cwd(), "data", "request-rides-user-map.json");

export function normalizePhoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function readUserMap(): UserMapRoot {
  if (!fs.existsSync(DEFAULT_MAP_PATH)) return {};
  try {
    const raw = fs.readFileSync(DEFAULT_MAP_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as UserMapRoot;
  } catch {
    return {};
  }
}

export type MappedUserCandidate = {
  phone: string;
  userId: string;
};

function writeUserMap(next: UserMapRoot) {
  const dir = path.dirname(DEFAULT_MAP_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DEFAULT_MAP_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function resolveMappedUserId(params: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
}): string | null {
  const phoneKey = normalizePhoneKey(params.phoneNumber);
  if (!phoneKey) return null;

  const map = readUserMap();
  const scopedKey = `${params.tokenLabel}:${params.clientId}`;
  const scoped = map[scopedKey] ?? {};
  if (scoped[phoneKey]) return scoped[phoneKey];

  const byClientId = map[params.clientId] ?? {};
  if (byClientId[phoneKey]) return byClientId[phoneKey];

  return null;
}

export function upsertMappedUserId(params: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
  userId: string;
}): boolean {
  const phoneKey = normalizePhoneKey(params.phoneNumber);
  const userId = params.userId.trim();
  if (!phoneKey || !userId) return false;

  const map = readUserMap();
  const scopedKey = `${params.tokenLabel}:${params.clientId}`;
  const scoped = map[scopedKey] ?? {};
  const byClientId = map[params.clientId] ?? {};

  const prevScoped = scoped[phoneKey];
  const prevByClient = byClientId[phoneKey];

  scoped[phoneKey] = userId;
  byClientId[phoneKey] = userId;

  map[scopedKey] = scoped;
  map[params.clientId] = byClientId;

  const changed = prevScoped !== userId || prevByClient !== userId;
  if (changed) {
    writeUserMap(map);
  }
  return changed;
}

export function removeMappedUserId(params: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
}): boolean {
  const phoneKey = normalizePhoneKey(params.phoneNumber);
  if (!phoneKey) return false;
  const map = readUserMap();
  const scopedKey = `${params.tokenLabel}:${params.clientId}`;
  const scoped = map[scopedKey] ?? {};
  const byClientId = map[params.clientId] ?? {};

  let changed = false;
  if (phoneKey in scoped) {
    delete scoped[phoneKey];
    changed = true;
  }
  if (phoneKey in byClientId) {
    delete byClientId[phoneKey];
    changed = true;
  }
  map[scopedKey] = scoped;
  map[params.clientId] = byClientId;
  if (changed) writeUserMap(map);
  return changed;
}

export function searchMappedUsers(params: {
  tokenLabel: string;
  clientId: string;
  query: string;
  limit?: number;
  /**
   * When true, only the pool `tokenLabel:clientId` is searched (no global / bare clientId).
   * Use for UI suggestions so employees from another cabinet never appear.
   */
  strictClientScope?: boolean;
}): MappedUserCandidate[] {
  const map = readUserMap();
  const scopedKey = `${params.tokenLabel}:${params.clientId}`;
  const pools = params.strictClientScope
    ? [map[scopedKey] ?? {}]
    : [map[scopedKey] ?? {}, map[params.clientId] ?? {}, map.global ?? {}];
  const raw = params.query.trim();
  const digitsQuery = raw.replace(/\D/g, "");
  const limit = Math.max(1, Math.min(params.limit ?? 8, 20));
  const byPhone = new Map<string, MappedUserCandidate>();

  for (const pool of pools) {
    for (const [phoneKey, userId] of Object.entries(pool)) {
      if (!phoneKey || !userId) continue;
      const matched =
        (digitsQuery && phoneKey.includes(digitsQuery)) ||
        (!digitsQuery && raw && phoneKey.includes(raw));
      if (!matched) continue;
      if (!byPhone.has(phoneKey)) {
        byPhone.set(phoneKey, { phone: `+${phoneKey}`, userId });
      }
      if (byPhone.size >= limit) {
        return [...byPhone.values()];
      }
    }
  }

  return [...byPhone.values()];
}

export function listMappedPhonesForClient(params: {
  tokenLabel: string;
  clientId: string;
  limit?: number;
}): string[] {
  const map = readUserMap();
  const scopedKey = `${params.tokenLabel}:${params.clientId}`;
  const pools = [map[scopedKey] ?? {}, map[params.clientId] ?? {}];
  const out: string[] = [];
  const seen = new Set<string>();
  const limit = Math.max(1, Math.min(params.limit ?? 50, 500));
  for (const pool of pools) {
    for (const phoneKey of Object.keys(pool)) {
      if (!phoneKey || seen.has(phoneKey)) continue;
      seen.add(phoneKey);
      out.push(`+${phoneKey}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
