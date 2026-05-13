import "dotenv/config";
import { kv } from "@vercel/kv";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { saveAuthStoreToSupabase } from "@/lib/supabase-auth-store";
import type { AuthStoreData, AuthUser } from "@/types/auth";

const AUTH_STORE_KEY = "appli:auth:store:v1";

function requireKvConfig() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    throw new Error("KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.");
  }
}

async function listAllAuthUsers() {
  const supabase = getSupabaseAdminClient();
  const users: Array<{ id: string; email: string }> = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list Supabase auth users: ${error.message}`);
    const batch = (data?.users ?? [])
      .map((user) => ({
        id: user.id,
        email: String(user.email ?? "").trim().toLowerCase(),
      }))
      .filter((user) => user.email);
    users.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

async function loadKvStore(): Promise<AuthStoreData> {
  requireKvConfig();
  const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
  if (!raw) {
    throw new Error(`KV key ${AUTH_STORE_KEY} is empty or missing.`);
  }
  return raw;
}

async function ensureSupabaseAuthUser(user: AuthUser, existingByEmail: Map<string, string>) {
  const supabase = getSupabaseAdminClient();
  const email = user.email.trim().toLowerCase();
  const existingAuthUserId = existingByEmail.get(email) ?? null;

  if (existingAuthUserId) {
    const { error } = await supabase.auth.admin.updateUserById(existingAuthUserId, {
      password: user.password,
      email_confirm: true,
      user_metadata: {
        crmPublicUserId: user.id,
        accountType: user.accountType ?? "internal",
        migratedFromKv: true,
      },
    });
    if (error) {
      throw new Error(`Failed to update auth user ${email}: ${error.message}`);
    }
    return existingAuthUserId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      crmPublicUserId: user.id,
      accountType: user.accountType ?? "internal",
      migratedFromKv: true,
    },
  });
  if (error || !data.user?.id) {
    throw new Error(`Failed to create auth user ${email}: ${error?.message ?? "unknown error"}`);
  }
  existingByEmail.set(email, data.user.id);
  return data.user.id;
}

async function verifyMigrationPersistence(expected: AuthStoreData) {
  const supabase = getSupabaseAdminClient();
  const expectedUsers = expected.users.length;
  const expectedTenants = expected.tenantAccounts?.length ?? 0;
  const expectedTenantRoleSets = Object.keys(expected.tenantRoles ?? {}).length;
  const expectedRoleRows = Object.keys(expected.rolePermissions ?? {}).length;

  const [
    profilesResult,
    tenantsResult,
    tenantRolesResult,
    rolePermissionsResult,
    roleAreaResult,
    roleDashboardResult,
    globalSettingsResult,
  ] = await Promise.all([
    supabase.from("crm_user_profiles").select("id", { count: "exact", head: true }),
    supabase.from("crm_tenant_accounts").select("id", { count: "exact", head: true }),
    supabase.from("crm_tenant_roles").select("tenant_id", { count: "exact", head: true }),
    supabase.from("crm_role_permissions").select("role", { count: "exact", head: true }),
    supabase.from("crm_role_area_access").select("role", { count: "exact", head: true }),
    supabase
      .from("crm_role_dashboard_block_access")
      .select("role", { count: "exact", head: true }),
    supabase.from("crm_global_b2c_settings").select("id", { count: "exact", head: true }),
  ]);

  const maybeThrow = (
    label: string,
    result: { error: { message: string } | null; count: number | null },
    expectedCount: number,
  ) => {
    if (result.error) {
      throw new Error(`Failed to verify ${label}: ${result.error.message}`);
    }
    if ((result.count ?? 0) < expectedCount) {
      throw new Error(
        `Verification failed for ${label}: expected at least ${expectedCount}, got ${result.count ?? 0}.`,
      );
    }
  };

  maybeThrow("crm_user_profiles", profilesResult, expectedUsers);
  maybeThrow("crm_tenant_accounts", tenantsResult, expectedTenants);
  maybeThrow("crm_tenant_roles", tenantRolesResult, expectedTenantRoleSets);
  maybeThrow("crm_role_permissions", rolePermissionsResult, expectedRoleRows);
  maybeThrow("crm_role_area_access", roleAreaResult, expectedRoleRows);
  maybeThrow("crm_role_dashboard_block_access", roleDashboardResult, expectedRoleRows);
  maybeThrow("crm_global_b2c_settings", globalSettingsResult, 1);
}

async function main() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const [kvStore, existingAuthUsers] = await Promise.all([loadKvStore(), listAllAuthUsers()]);
  const existingByEmail = new Map(existingAuthUsers.map((user) => [user.email, user.id]));

  let createdOrUpdatedUsers = 0;
  const migratedUsers: AuthUser[] = [];

  for (const user of kvStore.users ?? []) {
    if (!user.email?.trim()) continue;
    const authUserId = await ensureSupabaseAuthUser(user, existingByEmail);
    migratedUsers.push({
      ...user,
      authUserId,
      password: "",
    });
    createdOrUpdatedUsers += 1;
  }

  const nextStore: AuthStoreData = {
    ...kvStore,
    users: migratedUsers,
  };

  await saveAuthStoreToSupabase(nextStore);
  await verifyMigrationPersistence(nextStore);

  const summary = {
    usersTotal: migratedUsers.length,
    internalUsers: migratedUsers.filter((user) => (user.accountType ?? "internal") !== "client").length,
    clientUsers: migratedUsers.filter((user) => user.accountType === "client").length,
    tenantAccounts: nextStore.tenantAccounts?.length ?? 0,
    tenantRoleSets: Object.keys(nextStore.tenantRoles ?? {}).length,
    rolePermissionSets: Object.keys(nextStore.rolePermissions ?? {}).length,
    roleAreaAccessSets: Object.keys(nextStore.roleAreaAccess ?? {}).length,
    dashboardBlockAccessSets: Object.keys(nextStore.roleDashboardBlockAccess ?? {}).length,
    createdOrUpdatedUsers,
    globalB2CEnabled: nextStore.globalB2CSettings?.enabled === true,
  };

  console.log("KV auth store migrated to Supabase successfully.");
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
