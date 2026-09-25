/**
 * One-shot: rebuild crm_* auth store from Supabase Auth user_metadata
 * when Upstash KV is unavailable (quota exhausted).
 *
 * Usage: npx tsx scripts/migrate-auth-from-supabase-auth-meta.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../lib/supabase";
import { saveAuthStoreToSupabase } from "../lib/supabase-auth-store";
import {
  defaultClientPortalPermissions,
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type AppLanguage,
  type AppRole,
  type AuthStoreData,
  type AuthUser,
  type ClientRoleDefinition,
  type TenantAccount,
  type UserStatus,
} from "../types/auth";
import { CURRENT_PERMISSIONS_VERSION, isAppRole } from "../lib/role-permissions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

function isUserStatus(value: unknown): value is UserStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function normalizeLanguage(value: unknown): AppLanguage {
  return value === "he" || value === "ru" ? value : "en";
}

function defaultTenantRoles(): ClientRoleDefinition[] {
  return [
    {
      id: "client-admin",
      name: "Client Admin",
      isDefault: true,
      permissions: { ...defaultClientPortalPermissions, employees: true },
    },
    {
      id: "employee",
      name: "Employee",
      isDefault: true,
      permissions: { ...defaultClientPortalPermissions, employees: false },
    },
  ];
}

async function listAllAuthUsersDetailed() {
  const supabase = getSupabaseAdminClient();
  const users: Array<{
    id: string;
    email: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }> = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    for (const user of data?.users ?? []) {
      const email = String(user.email ?? "").trim().toLowerCase();
      if (!email) continue;
      const metadata =
        user.user_metadata && typeof user.user_metadata === "object"
          ? (user.user_metadata as Record<string, unknown>)
          : {};
      users.push({
        id: user.id,
        email,
        createdAt: typeof user.created_at === "string" ? user.created_at : new Date().toISOString(),
        metadata,
      });
    }
    if ((data?.users?.length ?? 0) < 1000) break;
    page += 1;
  }
  return users;
}

function mapAuthUser(row: {
  id: string;
  email: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}): AuthUser {
  const m = row.metadata;
  const publicId =
    typeof m.crmPublicUserId === "string" && m.crmPublicUserId.trim()
      ? m.crmPublicUserId.trim()
      : `user-${row.id}`;
  const role: AppRole = isAppRole(m.crmRole) ? m.crmRole : "User";
  const status: UserStatus = isUserStatus(m.crmStatus) ? m.crmStatus : "approved";
  const accountType = m.crmAccountType === "client" ? "client" : "internal";
  return {
    id: publicId,
    authUserId: row.id,
    name:
      typeof m.crmName === "string" && m.crmName.trim()
        ? m.crmName.trim()
        : row.email.split("@")[0] || "User",
    email: row.email,
    password: "",
    role,
    status,
    createdAt: row.createdAt,
    accountType,
    phoneNumber: typeof m.crmPhoneNumber === "string" ? m.crmPhoneNumber : null,
    costCenterId: typeof m.crmCostCenterId === "string" ? m.crmCostCenterId : null,
    tenantId: typeof m.crmTenantId === "string" ? m.crmTenantId : null,
    corpClientId: typeof m.crmCorpClientId === "string" ? m.crmCorpClientId : null,
    tokenLabel: typeof m.crmTokenLabel === "string" ? m.crmTokenLabel : null,
    apiClientId: typeof m.crmApiClientId === "string" ? m.crmApiClientId : null,
    clientRoleId: typeof m.crmClientRoleId === "string" ? m.crmClientRoleId : null,
    language: normalizeLanguage(m.crmLanguage),
    pageOverrides: undefined,
  };
}

function rebuildTenants(users: AuthUser[]): {
  tenantAccounts: TenantAccount[];
  tenantRoles: Record<string, ClientRoleDefinition[]>;
} {
  const byTenant = new Map<string, AuthUser>();
  for (const user of users) {
    if (user.accountType !== "client" || !user.tenantId) continue;
    if (!byTenant.has(user.tenantId)) byTenant.set(user.tenantId, user);
  }
  const tenantAccounts: TenantAccount[] = [];
  const tenantRoles: Record<string, ClientRoleDefinition[]> = {};
  for (const [tenantId, sample] of byTenant) {
    const corp = sample.corpClientId?.trim() || sample.apiClientId?.trim() || tenantId;
    const token = sample.tokenLabel?.trim() || "default";
    const apiClientId = sample.apiClientId?.trim() || corp;
    tenantAccounts.push({
      id: tenantId,
      name: token,
      corpClientId: corp,
      tokenLabel: token,
      apiClientId,
      defaultCostCenterId: sample.costCenterId ?? null,
      enabled: true,
      createdAt: sample.createdAt || new Date().toISOString(),
      clientPortalCommunicationsEnabled: true,
      clientPortalFinancialCenterEnabled: true,
    });
    tenantRoles[tenantId] = defaultTenantRoles();
  }
  return { tenantAccounts, tenantRoles };
}

async function main() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured in .env.local");
  }

  const authUsers = await listAllAuthUsersDetailed();
  const users = authUsers.map(mapAuthUser);
  const { tenantAccounts, tenantRoles } = rebuildTenants(users);

  const store: AuthStoreData = {
    users,
    rolePermissions: defaultRolePermissions,
    roleAreaAccess: defaultRoleAreaAccess,
    roleDashboardBlockAccess: defaultRoleDashboardBlockAccess,
    tenantAccounts,
    tenantRoles,
    globalB2CSettings: {
      enabled: false,
      token: null,
      clientId: null,
      rideClass: "comfortplus",
      createEndpoint: null,
    },
    storeMeta: { permissionsVersion: CURRENT_PERMISSIONS_VERSION },
  };

  await saveAuthStoreToSupabase(store);

  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("crm_user_profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Verify profiles failed: ${error.message}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: "supabase_auth_metadata",
        note: "KV unavailable (quota); role permissions seeded from code defaults",
        usersTotal: users.length,
        internalUsers: users.filter((u) => u.accountType !== "client").length,
        clientUsers: users.filter((u) => u.accountType === "client").length,
        tenantAccounts: tenantAccounts.length,
        profilesInDb: count ?? 0,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
