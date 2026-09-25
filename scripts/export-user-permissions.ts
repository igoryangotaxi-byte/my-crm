/**
 * Read-only export of CRM users, roles, and effective page permissions.
 * Uses Supabase SELECT only — never loadAuthStore, ensure*, upsert, or KV writes.
 *
 * Run: npx tsx scripts/export-user-permissions.ts
 * Optional: npx tsx scripts/export-user-permissions.ts --compare-kv
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { kv } from "@vercel/kv";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../lib/supabase";
import {
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type AppPageKey,
  type AuthStoreData,
  type AuthUser,
  type ClientRoleDefinition,
} from "../types/auth";
import { mergeAllRolePermissions } from "../lib/role-permissions";

const AUTH_STORE_KEY = "appli:auth:store:v1";
const compareKv = process.argv.includes("--compare-kv");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

type ProfileRow = {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  role: AuthUser["role"];
  status: AuthUser["status"];
  account_type: AuthUser["accountType"];
  phone_number: string | null;
  cost_center_id: string | null;
  tenant_id: string | null;
  corp_client_id: string | null;
  token_label: string | null;
  api_client_id: string | null;
  client_role_id: string | null;
  language: AuthUser["language"];
  created_at: string;
};

function mapProfile(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name,
    email: row.email,
    password: "",
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    accountType: row.account_type ?? "internal",
    phoneNumber: row.phone_number,
    costCenterId: row.cost_center_id,
    tenantId: row.tenant_id,
    corpClientId: row.corp_client_id,
    tokenLabel: row.token_label,
    apiClientId: row.api_client_id,
    clientRoleId: row.client_role_id,
    language: row.language ?? "en",
  };
}

async function loadStoreFromSupabaseSelectOnly(): Promise<AuthStoreData> {
  if (!isSupabaseConfigured()) {
    fail(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  const supabase = getSupabaseAdminClient();

  const profilesResult = await supabase
    .from("crm_user_profiles")
    .select(
      "id,auth_user_id,email,name,role,status,account_type,phone_number,cost_center_id,tenant_id,corp_client_id,token_label,api_client_id,client_role_id,language,created_at",
    )
    .order("created_at", { ascending: true });
  if (profilesResult.error) {
    fail(`Failed to load crm_user_profiles: ${profilesResult.error.message}`);
  }

  const rolePermsResult = await supabase.from("crm_role_permissions").select("role,permissions");
  if (rolePermsResult.error) {
    fail(`Failed to load crm_role_permissions: ${rolePermsResult.error.message}`);
  }

  const roleAreaResult = await supabase.from("crm_role_area_access").select("role,area_access");
  if (roleAreaResult.error) {
    fail(`Failed to load crm_role_area_access: ${roleAreaResult.error.message}`);
  }

  const dashboardResult = await supabase
    .from("crm_role_dashboard_block_access")
    .select("role,dashboard_block_access");
  if (dashboardResult.error) {
    fail(`Failed to load crm_role_dashboard_block_access: ${dashboardResult.error.message}`);
  }

  const tenantsResult = await supabase
    .from("crm_tenant_accounts")
    .select("id,name,corp_client_id,token_label,api_client_id,enabled,created_at")
    .order("created_at", { ascending: true });
  if (tenantsResult.error) {
    fail(`Failed to load crm_tenant_accounts: ${tenantsResult.error.message}`);
  }

  const tenantRolesResult = await supabase.from("crm_tenant_roles").select("tenant_id,roles");
  if (tenantRolesResult.error) {
    fail(`Failed to load crm_tenant_roles: ${tenantRolesResult.error.message}`);
  }

  const rolePermissions = { ...defaultRolePermissions };
  for (const row of rolePermsResult.data ?? []) {
    const role = row.role as AuthUser["role"];
    if (!role || typeof role !== "string") continue;
    rolePermissions[role] = {
      ...rolePermissions[role],
      ...(row.permissions as Record<AppPageKey, boolean>),
    };
  }

  const roleAreaAccess = { ...defaultRoleAreaAccess };
  for (const row of roleAreaResult.data ?? []) {
    const role = row.role as AuthUser["role"];
    if (!role) continue;
    roleAreaAccess[role] = {
      ...roleAreaAccess[role],
      ...(row.area_access as Record<string, boolean>),
    };
  }

  const roleDashboardBlockAccess = { ...defaultRoleDashboardBlockAccess };
  for (const row of dashboardResult.data ?? []) {
    const role = row.role as AuthUser["role"];
    if (!role) continue;
    roleDashboardBlockAccess[role] = {
      ...roleDashboardBlockAccess[role],
      ...(row.dashboard_block_access as Record<string, boolean>),
    };
  }

  const tenantRoles: Record<string, ClientRoleDefinition[]> = {};
  for (const row of tenantRolesResult.data ?? []) {
    if (typeof row.tenant_id === "string" && Array.isArray(row.roles)) {
      tenantRoles[row.tenant_id] = row.roles as ClientRoleDefinition[];
    }
  }

  const users = ((profilesResult.data ?? []) as ProfileRow[]).map(mapProfile);

  return {
    users,
    rolePermissions: mergeAllRolePermissions(rolePermissions, 18),
    roleAreaAccess,
    roleDashboardBlockAccess,
    tenantAccounts: [],
    tenantRoles,
    globalB2CSettings: {
      enabled: false,
      token: null,
      clientId: null,
      rideClass: "comfortplus",
      createEndpoint: null,
    },
    storeMeta: { permissionsVersion: 18 },
  };
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
  return enabledPageKeys(store.rolePermissions[user.role] as Record<string, boolean>);
}

async function tryLoadKvSnapshot(): Promise<{ store: AuthStoreData | null; error: string | null }> {
  if (!canUseKv()) {
    return { store: null, error: "KV env not configured (KV_REST_API_URL / KV_REST_API_TOKEN)." };
  }
  try {
    const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
    if (!raw) {
      return { store: null, error: `KV key ${AUTH_STORE_KEY} is empty or missing.` };
    }
    return { store: raw, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { store: null, error: message };
  }
}

async function main() {
  const store = await loadStoreFromSupabaseSelectOnly();

  let kvCompare: {
    attempted: boolean;
    error: string | null;
    userCount: number | null;
    roleMismatchCount: number | null;
  } = {
    attempted: false,
    error: null,
    userCount: null,
    roleMismatchCount: null,
  };

  if (compareKv) {
    kvCompare.attempted = true;
    const kv = await tryLoadKvSnapshot();
    kvCompare.error = kv.error;
    if (kv.store) {
      kvCompare.userCount = kv.store.users.length;
      const kvById = new Map(kv.store.users.map((user) => [user.id, user]));
      let mismatches = 0;
      for (const user of store.users) {
        const other = kvById.get(user.id);
        if (other && (other.role !== user.role || other.status !== user.status)) {
          mismatches += 1;
        }
      }
      kvCompare.roleMismatchCount = mismatches;
    }
  }

  const meta = {
    exportedAt: new Date().toISOString(),
    canonicalStore: "supabase (select-only queries; no loadAuthStore / no seed)",
    supabaseConfigured: true,
    userCount: store.users.length,
    compareKv,
    kvCompare,
  };

  const users = store.users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    accountType: user.accountType ?? "internal",
    role: user.accountType === "client" ? user.clientRoleId ?? "employee" : user.role,
    approved: user.status === "approved",
    status: user.status,
    permissionKeys: permissionsForUser(store, user),
    storeSource: meta.canonicalStore,
  }));

  console.log(JSON.stringify({ meta, users }, null, 2));
}

void main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
