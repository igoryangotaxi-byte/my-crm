import { kv } from "@vercel/kv";
import {
  type AccountType,
  type AppLanguage,
  type AppPageKey,
  type AppRole,
  type ClientRoleDefinition,
  type AuthStoreData,
  type AuthUser,
  type TenantAccount,
  type UserStatus,
  defaultClientPortalPermissions,
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
} from "@/types/auth";
import {
  CURRENT_PERMISSIONS_VERSION,
  isAppRole,
  mergeAllRoleAreaAccess,
  mergeAllRoleDashboardBlockAccess,
  mergeAllRolePermissions,
} from "@/lib/role-permissions";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  createAuthBackedUser as createSupabaseAuthBackedUser,
  deleteAuthBackedUser as deleteSupabaseAuthBackedUser,
  saveAuthStoreToSupabase,
  saveAuthUsersToSupabaseAuthFallback,
  updateAuthUserPassword as updateSupabaseAuthUserPassword,
  upsertExistingAuthUserProfile as upsertSupabaseExistingAuthUserProfile,
  verifyLoginCredentials as verifySupabaseLoginCredentials,
  loadAuthStore as loadSupabaseAuthStore,
} from "@/lib/supabase-auth-store";

const AUTH_STORE_KEY = "appli:auth:store:v1";
const DEFAULT_ADMIN_EMAIL = "ig-kuznetsov@appli.taxi";
/** Shared seed-admin email, used to grant Admin on first Google SSO provisioning. */
export const SEEDED_ADMIN_EMAIL = DEFAULT_ADMIN_EMAIL;
const DEFAULT_ADMIN_PASSWORD = "123";
const DEFAULT_ADMIN_NAME = "Igor Kuznetsov";
const DEFAULT_LANGUAGE: AppLanguage = "en";

let fallbackMemoryStore: AuthStoreData | null = null;

function seedDefaultUsers(): AuthUser[] {
  return [
    {
      id: "user-admin-1",
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "Admin",
      status: "approved",
      createdAt: new Date().toISOString(),
    },
  ];
}

function ensureDefaultAdmin(users: AuthUser[]): AuthUser[] {
  const existingAdminIndex = users.findIndex(
    (user) => user.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase(),
  );

  if (existingAdminIndex >= 0) {
    return users.map((user, index) =>
      index === existingAdminIndex
        ? {
            ...user,
            name: DEFAULT_ADMIN_NAME,
            password: DEFAULT_ADMIN_PASSWORD,
            role: "Admin" as const,
            status: "approved" as const,
          }
        : user,
    );
  }

  return [
    ...users,
    {
      id: "user-admin-1",
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "Admin" as const,
      status: "approved" as const,
      createdAt: new Date().toISOString(),
    },
  ];
}


const LEGACY_REMOVED_CLIENT_CABINET_CORP_IDS = new Set([
  "8234b0f928a348e19cf8ccf2df6d4fd7",
  "1151f896bd8248ed977d4abcf1df4929",
]);

const LEGACY_REMOVED_CLIENT_CABINET_NAMES = new Set(["zhak", "star taxi point"]);

function isLegacyRemovedClientCabinetTenant(tenant: TenantAccount): boolean {
  const corp = tenant.corpClientId.trim().toLowerCase();
  if (LEGACY_REMOVED_CLIENT_CABINET_CORP_IDS.has(corp)) return true;
  const label = tenant.name.trim().toLowerCase();
  if (LEGACY_REMOVED_CLIENT_CABINET_NAMES.has(label)) return true;
  return false;
}

function defaultTenantRoleSet(): ClientRoleDefinition[] {
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

function createDefaultStore(): AuthStoreData {
  return {
    users: seedDefaultUsers(),
    rolePermissions: defaultRolePermissions,
    roleAreaAccess: defaultRoleAreaAccess,
    roleDashboardBlockAccess: defaultRoleDashboardBlockAccess,
    tenantAccounts: [],
    tenantRoles: {},
    globalB2CSettings: {
      enabled: false,
      token: null,
      clientId: null,
      rideClass: "comfortplus",
      createEndpoint: null,
    },
    storeMeta: { permissionsVersion: CURRENT_PERMISSIONS_VERSION },
  };
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function normalizeLanguage(value: unknown): AppLanguage {
  return value === "he" ? "he" : DEFAULT_LANGUAGE;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.email === "string" &&
    typeof item.password === "string" &&
    typeof item.createdAt === "string" &&
    isAppRole(item.role) &&
    isUserStatus(item.status)
  );
}

function normalizeAccountType(value: unknown): AccountType {
  return value === "client" ? "client" : "internal";
}

function normalizeTenantAccounts(input: unknown): TenantAccount[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : `tenant-${crypto.randomUUID()}`,
      name: typeof item.name === "string" ? item.name : "Client",
      corpClientId: typeof item.corpClientId === "string" ? item.corpClientId : "",
      tokenLabel: typeof item.tokenLabel === "string" ? item.tokenLabel : "",
      apiClientId: typeof item.apiClientId === "string" ? item.apiClientId : "",
      defaultCostCenterId:
        typeof item.defaultCostCenterId === "string" ? item.defaultCostCenterId : null,
      pinnedDefaultCostCenterId:
        typeof item.pinnedDefaultCostCenterId === "string" ? item.pinnedDefaultCostCenterId : null,
      b2cEnabled: item.b2cEnabled === true,
      b2cToken: typeof item.b2cToken === "string" ? item.b2cToken : null,
      b2cClientId: typeof item.b2cClientId === "string" ? item.b2cClientId : null,
      b2cRideClass: typeof item.b2cRideClass === "string" ? item.b2cRideClass : "comfortplus",
      b2cCreateEndpoint:
        typeof item.b2cCreateEndpoint === "string" ? item.b2cCreateEndpoint : null,
      clientPortalCommunicationsEnabled:
        typeof item.clientPortalCommunicationsEnabled === "boolean"
          ? item.clientPortalCommunicationsEnabled
          : true,
      clientPortalFinancialCenterEnabled:
        typeof item.clientPortalFinancialCenterEnabled === "boolean"
          ? item.clientPortalFinancialCenterEnabled
          : true,
      enabled: item.enabled !== false,
      createdAt:
        typeof item.createdAt === "string" && item.createdAt
          ? item.createdAt
          : new Date().toISOString(),
    }))
    .filter((item) => item.corpClientId && item.tokenLabel && item.apiClientId);
}

function normalizeTenantRoles(input: unknown, tenantAccounts: TenantAccount[]) {
  const out: Record<string, ClientRoleDefinition[]> = {};
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  for (const tenant of tenantAccounts) {
    const tenantRaw = raw[tenant.id];
    const roles = Array.isArray(tenantRaw)
      ? (tenantRaw as unknown[])
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : `role-${crypto.randomUUID()}`,
            name: typeof item.name === "string" ? item.name : "Role",
            isDefault: item.isDefault === true,
            permissions: {
              ...defaultClientPortalPermissions,
              ...((item.permissions as Record<string, boolean> | undefined) ?? {}),
            },
          }))
      : [];
    out[tenant.id] = roles.length > 0 ? roles : defaultTenantRoleSet();
  }
  return out;
}

function normalizeStore(data: Partial<AuthStoreData> | null | undefined): AuthStoreData {
  const base = createDefaultStore();
  if (!data) {
    return base;
  }

  const allNormalizedTenants = normalizeTenantAccounts(data.tenantAccounts);
  const removedTenantIds = new Set(
    allNormalizedTenants.filter(isLegacyRemovedClientCabinetTenant).map((t) => t.id),
  );
  const tenantAccounts = allNormalizedTenants.filter((t) => !isLegacyRemovedClientCabinetTenant(t));

  const users =
    Array.isArray(data.users) && data.users.length > 0
      ? ensureDefaultAdmin(
          data.users
            .filter(isAuthUser)
            .filter((item) => {
              if (!item.tenantId || removedTenantIds.size === 0) return true;
              if (normalizeAccountType(item.accountType) !== "client") return true;
              return !removedTenantIds.has(item.tenantId);
            })
            .map((item) => ({
              ...item,
              phoneNumber: typeof item.phoneNumber === "string" ? item.phoneNumber : null,
              costCenterId: typeof item.costCenterId === "string" ? item.costCenterId : null,
              accountType: normalizeAccountType(item.accountType),
              tenantId: item.tenantId ?? null,
              corpClientId: item.corpClientId ?? null,
              tokenLabel: item.tokenLabel ?? null,
              apiClientId: item.apiClientId ?? null,
              clientRoleId: item.clientRoleId ?? null,
              language: normalizeLanguage(item.language),
            })),
        )
      : base.users;
  const tenantRoles = normalizeTenantRoles(data.tenantRoles, tenantAccounts);

  const storedVersion = data.storeMeta?.permissionsVersion ?? 0;

  return {
    users,
    rolePermissions: mergeAllRolePermissions(data.rolePermissions, storedVersion),
    roleAreaAccess: mergeAllRoleAreaAccess(data.roleAreaAccess),
    roleDashboardBlockAccess: mergeAllRoleDashboardBlockAccess(data.roleDashboardBlockAccess),
    tenantAccounts,
    tenantRoles,
    globalB2CSettings: {
      enabled: data.globalB2CSettings?.enabled === true,
      token: typeof data.globalB2CSettings?.token === "string" ? data.globalB2CSettings.token : null,
      clientId:
        typeof data.globalB2CSettings?.clientId === "string" ? data.globalB2CSettings.clientId : null,
      rideClass:
        typeof data.globalB2CSettings?.rideClass === "string"
          ? data.globalB2CSettings.rideClass
          : "comfortplus",
      createEndpoint:
        typeof data.globalB2CSettings?.createEndpoint === "string"
          ? data.globalB2CSettings.createEndpoint
          : null,
    },
    storeMeta: {
      permissionsVersion: Math.max(storedVersion, CURRENT_PERMISSIONS_VERSION),
    },
  };
}

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function loadLegacyAuthStore(): Promise<AuthStoreData> {
  if (canUseKv()) {
    try {
      const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
      const normalized = normalizeStore(raw);
      const prevVersion = raw?.storeMeta?.permissionsVersion ?? 0;
      if (!raw || prevVersion < CURRENT_PERMISSIONS_VERSION) {
        await kv.set(AUTH_STORE_KEY, normalized);
      }
      return normalized;
    } catch {
      // Fall through to memory store for resilience.
    }
  }

  if (!fallbackMemoryStore) {
    fallbackMemoryStore = createDefaultStore();
  }

  fallbackMemoryStore = normalizeStore(fallbackMemoryStore);
  return fallbackMemoryStore;
}

async function saveLegacyAuthStore(data: AuthStoreData): Promise<void> {
  const normalized = normalizeStore(data);

  if (canUseKv()) {
    try {
      await kv.set(AUTH_STORE_KEY, normalized);
      return;
    } catch {
      // Fall through to memory store for resilience.
    }
  }

  fallbackMemoryStore = normalized;
}

function shouldTrySupabase() {
  return isSupabaseConfigured();
}

export async function loadAuthStore(): Promise<AuthStoreData> {
  if (shouldTrySupabase()) {
    try {
      return await loadSupabaseAuthStore();
    } catch {
      return loadLegacyAuthStore();
    }
  }
  return loadLegacyAuthStore();
}

export async function saveAuthStore(data: AuthStoreData): Promise<void> {
  if (shouldTrySupabase()) {
    try {
      await saveAuthStoreToSupabase(data);
      return;
    } catch {
      try {
        await saveAuthUsersToSupabaseAuthFallback(data);
      } catch {
        // Continue to legacy save for resilience.
      }
      await saveLegacyAuthStore(data);
      return;
    }
  }
  await saveLegacyAuthStore(data);
}

export async function findUserByPublicId(userId: string): Promise<AuthUser | null> {
  const store = await loadAuthStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const store = await loadAuthStore();
  return store.users.find((user) => user.email.trim().toLowerCase() === normalizedEmail) ?? null;
}

export async function createAuthBackedUser(
  input: Parameters<typeof createSupabaseAuthBackedUser>[0],
): Promise<AuthUser> {
  if (shouldTrySupabase()) {
    try {
      return await createSupabaseAuthBackedUser(input);
    } catch {
      // fall through to legacy user creation
    }
  }

  return {
    id: input.publicUserId ?? `user-${crypto.randomUUID()}`,
    authUserId: null,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    role: input.role,
    status: input.status,
    createdAt: input.createdAt ?? new Date().toISOString(),
    accountType: normalizeAccountType(input.accountType),
    phoneNumber: input.phoneNumber ?? null,
    costCenterId: input.costCenterId ?? null,
    tenantId: input.tenantId ?? null,
    corpClientId: input.corpClientId ?? null,
    tokenLabel: input.tokenLabel ?? null,
    apiClientId: input.apiClientId ?? null,
    clientRoleId: input.clientRoleId ?? null,
    language: normalizeLanguage(input.language),
  };
}

export async function updateAuthUserPassword(authUserId: string, password: string): Promise<void> {
  if (shouldTrySupabase() && authUserId) {
    try {
      await updateSupabaseAuthUserPassword(authUserId, password);
    } catch {
      // Password will continue to persist via legacy store save path.
    }
  }
}

export async function deleteAuthBackedUser(
  publicUserId: string,
  options?: { email?: string | null },
): Promise<void> {
  if (shouldTrySupabase()) {
    await deleteSupabaseAuthBackedUser(publicUserId, options);
  }
}

export async function verifyLoginCredentials(email: string, password: string): Promise<AuthUser | null> {
  if (shouldTrySupabase()) {
    try {
      const user = await verifySupabaseLoginCredentials(email, password);
      if (user) return user;
    } catch {
      // Fall through to legacy password validation.
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const store = await loadLegacyAuthStore();
  return (
    store.users.find(
      (user) =>
        user.email.trim().toLowerCase() === normalizedEmail &&
        user.password === password,
    ) ?? null
  );
}

export async function upsertExistingAuthUserProfile(input: AuthUser): Promise<void> {
  if (shouldTrySupabase() && input.authUserId) {
    try {
      await upsertSupabaseExistingAuthUserProfile(input);
    } catch {
      // Legacy persistence continues through saveAuthStore().
    }
  }
}
