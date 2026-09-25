/**
 * Read-only export of CRM users, roles, and effective page permissions.
 * Never writes. Never prints passwords, tokens, or service keys.
 *
 * Run (from repo root, with production-like env in .env.local):
 *   npx tsx scripts/export-user-permissions.ts
 *
 * Optional:
 *   npx tsx scripts/export-user-permissions.ts --compare-kv
 *
 * Note: intentionally does NOT call loadAuthStore(), which may migrate permission
 * defaults and write back to KV on read in some builds.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { kv } from "@vercel/kv";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type AppPageKey,
  type AuthStoreData,
  type AuthUser,
} from "../types/auth";

const AUTH_STORE_KEY = "appli:auth:store:v1";
const compareKv = process.argv.includes("--compare-kv");

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function loadSupabaseStoreReadOnly(): Promise<AuthStoreData | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const mod = await import("../lib/supabase-auth-store");
    if (typeof mod.loadAuthStoreFromSupabase === "function") {
      return await mod.loadAuthStoreFromSupabase();
    }
  } catch {
    return null;
  }
  return null;
}

async function normalizeKvSnapshot(raw: AuthStoreData): Promise<AuthStoreData> {
  const storedVersion = raw.storeMeta?.permissionsVersion ?? 0;
  try {
    const rp = await import("../lib/role-permissions");
    return {
      ...raw,
      users: Array.isArray(raw.users) ? raw.users : [],
      rolePermissions: rp.mergeAllRolePermissions(raw.rolePermissions, storedVersion),
      roleAreaAccess: rp.mergeAllRoleAreaAccess(raw.roleAreaAccess),
      roleDashboardBlockAccess: rp.mergeAllRoleDashboardBlockAccess(raw.roleDashboardBlockAccess),
      tenantAccounts: raw.tenantAccounts ?? [],
      tenantRoles: raw.tenantRoles ?? {},
    };
  } catch {
    return {
      ...raw,
      users: Array.isArray(raw.users) ? raw.users : [],
      rolePermissions: { ...defaultRolePermissions, ...(raw.rolePermissions ?? {}) },
      roleAreaAccess: { ...defaultRoleAreaAccess, ...(raw.roleAreaAccess ?? {}) },
      roleDashboardBlockAccess: {
        ...defaultRoleDashboardBlockAccess,
        ...(raw.roleDashboardBlockAccess ?? {}),
      },
      tenantAccounts: raw.tenantAccounts ?? [],
      tenantRoles: raw.tenantRoles ?? {},
    };
  }
}

async function loadKvStoreReadOnly(): Promise<AuthStoreData | null> {
  if (!canUseKv()) return null;
  try {
    const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
    if (!raw) return null;
    return normalizeKvSnapshot(raw);
  } catch {
    return null;
  }
}

function enabledPageKeys(permissions: Record<string, boolean> | undefined): string[] {
  if (!permissions) return [];
  return Object.entries(permissions)
    .filter(([, allowed]) => allowed === true)
    .map(([key]) => key)
    .sort();
}

function permissionsForUser(store: AuthStoreData, user: AuthUser): string[] {
  if (user.accountType === "client") {
    const tenantId = user.tenantId ?? "";
    const roleId = user.clientRoleId ?? "";
    const role = (store.tenantRoles?.[tenantId] ?? []).find((item) => item.id === roleId);
    return enabledPageKeys(role?.permissions);
  }
  const rolePerms = store.rolePermissions[user.role];
  return enabledPageKeys(rolePerms as Record<AppPageKey, boolean> | undefined);
}

type ExportRow = {
  id: string;
  email: string;
  name: string;
  accountType: string;
  role: string;
  approved: boolean;
  status: string;
  permissionKeys: string[];
  storeSource: string;
  kvRoleMismatch?: boolean;
};

function buildRows(store: AuthStoreData, storeSource: string, kvStore: AuthStoreData | null): ExportRow[] {
  const kvById = new Map((kvStore?.users ?? []).map((user) => [user.id, user]));
  return store.users.map((user) => {
    const kvUser = kvById.get(user.id);
    const kvRoleMismatch =
      kvUser != null && (kvUser.role !== user.role || kvUser.status !== user.status);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      accountType: user.accountType ?? "internal",
      role: user.accountType === "client" ? user.clientRoleId ?? "employee" : user.role,
      approved: user.status === "approved",
      status: user.status,
      permissionKeys: permissionsForUser(store, user),
      storeSource,
      ...(compareKv && kvStore ? { kvRoleMismatch } : {}),
    };
  });
}

async function resolveReadOnlyStore(): Promise<{ store: AuthStoreData; storeSource: string }> {
  const supabaseStore = await loadSupabaseStoreReadOnly();
  if (supabaseStore) {
    return { store: supabaseStore, storeSource: "supabase (crm_* tables, read-only)" };
  }
  const kvStore = await loadKvStoreReadOnly();
  if (kvStore) {
    return { store: kvStore, storeSource: "kv (appli:auth:store:v1, read-only get)" };
  }
  throw new Error(
    "No auth store available. Set Supabase and/or KV env vars in .env.local (see docs/export-user-permissions.md).",
  );
}

async function main() {
  const { store, storeSource } = await resolveReadOnlyStore();
  const kvStore = compareKv ? await loadKvStoreReadOnly() : null;

  const meta = {
    exportedAt: new Date().toISOString(),
    canonicalStore: storeSource,
    supabaseConfigured: isSupabaseConfigured(),
    kvConfigured: canUseKv(),
    userCount: store.users.length,
    compareKv,
    kvUserCount: kvStore?.users.length ?? null,
  };

  const rows = buildRows(store, storeSource, kvStore);
  console.log(JSON.stringify({ meta, users: rows }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
