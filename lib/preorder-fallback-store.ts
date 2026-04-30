import fs from "node:fs";
import path from "node:path";
import type { PreOrderFallbackSnapshot, PreOrderFallbackStatus } from "@/types/crm";

type PreOrderFallbackStoreItem = {
  sourceOrderId: string;
  tokenLabel: string;
  clientId: string;
  status: PreOrderFallbackStatus;
  reason: string | null;
  attempts: number;
  thresholdMinutes: number;
  lockOwner: string | null;
  lockUntil: string | null;
  cooldownUntil: string | null;
  fallbackOrderId: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PreOrderFallbackStore = Record<string, PreOrderFallbackStoreItem>;

const STORE_PATH = path.join(process.cwd(), "data", "preorder-fallback-store.json");
const LOCK_TTL_MS = 60_000;
const FAIL_COOLDOWN_MS = 90_000;
const MAX_ATTEMPTS = 3;

function nowIso() {
  return new Date().toISOString();
}

function toTs(value: string | null): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function readStore(): PreOrderFallbackStore {
  if (!fs.existsSync(STORE_PATH)) return {};
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PreOrderFallbackStore;
  } catch {
    return {};
  }
}

function writeStore(store: PreOrderFallbackStore) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function keyOf(input: { tokenLabel: string; clientId: string; orderId: string }) {
  return `${input.tokenLabel}:${input.clientId}:${input.orderId}`;
}

function defaultItem(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
  thresholdMinutes: number;
}): PreOrderFallbackStoreItem {
  const now = nowIso();
  return {
    sourceOrderId: input.orderId,
    tokenLabel: input.tokenLabel,
    clientId: input.clientId,
    status: "idle",
    reason: null,
    attempts: 0,
    thresholdMinutes: input.thresholdMinutes,
    lockOwner: null,
    lockUntil: null,
    cooldownUntil: null,
    fallbackOrderId: null,
    lastAttemptAt: null,
    completedAt: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function toSnapshot(item: PreOrderFallbackStoreItem): PreOrderFallbackSnapshot {
  return {
    status: item.status,
    reason: item.reason,
    attempts: item.attempts,
    lastAttemptAt: item.lastAttemptAt,
    completedAt: item.completedAt,
    failedAt: item.failedAt,
    fallbackOrderId: item.fallbackOrderId,
    sourceOrderId: item.sourceOrderId,
    thresholdMinutes: item.thresholdMinutes,
  };
}

export function getPreOrderFallbackSnapshot(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
}): PreOrderFallbackSnapshot | null {
  const store = readStore();
  const key = keyOf(input);
  const item = store[key];
  return item ? toSnapshot(item) : null;
}

export function listPreOrderFallbackSnapshotsByScope(input: {
  tokenLabel: string;
  clientId: string;
}): Record<string, PreOrderFallbackSnapshot> {
  const store = readStore();
  const out: Record<string, PreOrderFallbackSnapshot> = {};
  for (const item of Object.values(store)) {
    if (item.tokenLabel !== input.tokenLabel || item.clientId !== input.clientId) continue;
    out[item.sourceOrderId] = toSnapshot(item);
  }
  return out;
}

export function tryStartPreOrderFallbackAttempt(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
  thresholdMinutes: number;
  lockOwner: string;
}):
  | { ok: true; snapshot: PreOrderFallbackSnapshot }
  | { ok: false; reason: string; snapshot: PreOrderFallbackSnapshot | null } {
  const store = readStore();
  const key = keyOf(input);
  const now = Date.now();
  const item = store[key] ?? defaultItem(input);
  item.thresholdMinutes = input.thresholdMinutes;

  if (item.status === "completed") {
    store[key] = item;
    writeStore(store);
    return { ok: false, reason: "already_completed", snapshot: toSnapshot(item) };
  }
  if (item.attempts >= MAX_ATTEMPTS) {
    item.status = "failed";
    item.reason = item.reason ?? "max_attempts_reached";
    item.updatedAt = nowIso();
    store[key] = item;
    writeStore(store);
    return { ok: false, reason: "max_attempts_reached", snapshot: toSnapshot(item) };
  }
  if (toTs(item.cooldownUntil) > now) {
    store[key] = item;
    writeStore(store);
    return { ok: false, reason: "cooldown", snapshot: toSnapshot(item) };
  }
  if (toTs(item.lockUntil) > now && item.lockOwner && item.lockOwner !== input.lockOwner) {
    store[key] = item;
    writeStore(store);
    return { ok: false, reason: "locked", snapshot: toSnapshot(item) };
  }

  item.status = "in_progress";
  item.reason = null;
  item.lockOwner = input.lockOwner;
  item.lockUntil = new Date(now + LOCK_TTL_MS).toISOString();
  item.lastAttemptAt = nowIso();
  item.attempts += 1;
  item.updatedAt = nowIso();
  store[key] = item;
  writeStore(store);
  return { ok: true, snapshot: toSnapshot(item) };
}

export function finishPreOrderFallbackAttempt(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
  lockOwner: string;
  outcome: "completed" | "failed" | "skipped";
  reason?: string | null;
  fallbackOrderId?: string | null;
}) {
  const store = readStore();
  const key = keyOf(input);
  const existing = store[key];
  if (!existing) return null;
  if (existing.lockOwner && existing.lockOwner !== input.lockOwner) return toSnapshot(existing);
  const now = nowIso();
  existing.status = input.outcome;
  existing.reason = input.reason?.trim() || null;
  existing.fallbackOrderId = input.fallbackOrderId?.trim() || existing.fallbackOrderId || null;
  existing.lockOwner = null;
  existing.lockUntil = null;
  if (input.outcome === "completed") {
    existing.completedAt = now;
    existing.cooldownUntil = null;
  } else if (input.outcome === "failed") {
    existing.failedAt = now;
    existing.cooldownUntil = new Date(Date.now() + FAIL_COOLDOWN_MS).toISOString();
  } else {
    existing.cooldownUntil = new Date(Date.now() + 30_000).toISOString();
  }
  existing.updatedAt = now;
  store[key] = existing;
  writeStore(store);
  return toSnapshot(existing);
}
