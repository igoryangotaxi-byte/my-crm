import { kv } from "@vercel/kv";
import {
  type AccountType,
  type AppLanguage,
  type AppRole,
  type AuthStoreData,
  type AuthUser,
  type ClientRoleDefinition,
  type GlobalB2CFallbackSettings,
  type RoleAreaAccess,
  type RoleDashboardBlockAccess,
  type RolePermissions,
  type TenantAccount,
  type UserStatus,
  defaultClientPortalPermissions,
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
} from "@/types/auth";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

const DEFAULT_ADMIN_EMAIL = "ig-kuznetsov@yandex-team.ru";
const DEFAULT_ADMIN_PASSWORD = "123";
const DEFAULT_ADMIN_NAME = "Igor Kuznetsov";
const DEFAULT_LANGUAGE: AppLanguage = "en";
const DEFAULT_ADMIN_PUBLIC_ID = "user-admin-1";
const CURRENT_PERMISSIONS_VERSION = 7;
const AUTH_STORE_KEY = "appli:auth:store:v1";
let fallbackMemoryStore: AuthStoreData | null = null;

const LEGACY_REMOVED_CLIENT_CABINET_CORP_IDS = new Set([
  "8234b0f928a348e19cf8ccf2df6d4fd7",
  "1151f896bd8248ed977d4abcf1df4929",
]);

const LEGACY_REMOVED_CLIENT_CABINET_NAMES = new Set(["zhak", "star taxi point"]);

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

type AuthUserInput = {
  publicUserId?: string;
  name: string;
  email: string;
  password: string;
  role: AppRole;
  status: UserStatus;
  accountType?: AccountType | null;
  phoneNumber?: string | null;
  costCenterId?: string | null;
  tenantId?: string | null;
  corpClientId?: string | null;
  tokenLabel?: string | null;
  apiClientId?: string | null;
  clientRoleId?: string | null;
  language?: AppLanguage | null;
  createdAt?: string | null;
};

type AuthProfileRow = {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  role: AppRole;
  status: UserStatus;
  account_type: AccountType;
  phone_number: string | null;
  cost_center_id: string | null;
  tenant_id: string | null;
  corp_client_id: string | null;
  token_label: string | null;
  api_client_id: string | null;
  client_role_id: string | null;
  language: AppLanguage;
  created_at: string;
  updated_at: string;
};

type RoleJsonRow = {
  role: AppRole;
  permissions?: Record<string, boolean>;
  area_access?: Record<string, boolean>;
  dashboard_block_access?: Record<string, boolean>;
};

type TenantRolesRow = {
  tenant_id: string;
  roles: ClientRoleDefinition[];
};

type SupabaseAuthMetadata = {
  crmManaged?: boolean;
  crmPublicUserId?: string;
  crmName?: string;
  crmRole?: AppRole;
  crmStatus?: UserStatus;
  crmAccountType?: AccountType;
  crmLanguage?: AppLanguage;
  crmPhoneNumber?: string | null;
  crmCostCenterId?: string | null;
  crmTenantId?: string | null;
  crmCorpClientId?: string | null;
  crmTokenLabel?: string | null;
  crmApiClientId?: string | null;
  crmClientRoleId?: string | null;
};

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

function normalizeLanguage(value: unknown): AppLanguage {
  return value === "he" ? "he" : DEFAULT_LANGUAGE;
}

function normalizeAccountType(value: unknown): AccountType {
  return value === "client" ? "client" : "internal";
}

function isAppRole(value: unknown): value is AppRole {
  return value === "Admin" || value === "User" || value === "Team Lead";
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function isLegacyRemovedClientCabinetTenant(tenant: TenantAccount): boolean {
  const corp = tenant.corpClientId.trim().toLowerCase();
  if (LEGACY_REMOVED_CLIENT_CABINET_CORP_IDS.has(corp)) return true;
  const label = tenant.name.trim().toLowerCase();
  if (LEGACY_REMOVED_CLIENT_CABINET_NAMES.has(label)) return true;
  return false;
}

function seedDefaultUsers(): AuthUser[] {
  return [
    {
      id: DEFAULT_ADMIN_PUBLIC_ID,
      authUserId: null,
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "Admin",
      status: "approved",
      createdAt: new Date().toISOString(),
      accountType: "internal",
      language: DEFAULT_LANGUAGE,
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

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isMissingSupabaseAuthSchemaMessage(message: string) {
  return (
    message.includes("crm_user_profiles") ||
    message.includes("crm_role_permissions") ||
    message.includes("crm_role_area_access") ||
    message.includes("crm_role_dashboard_block_access") ||
    message.includes("crm_tenant_accounts") ||
    message.includes("crm_tenant_roles") ||
    message.includes("crm_global_b2c_settings") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

function isMissingSupabaseAuthSchemaError(error: unknown) {
  return error instanceof Error && isMissingSupabaseAuthSchemaMessage(error.message);
}

function buildSupabaseAuthMetadata(input: {
  publicUserId: string;
  name: string;
  role: AppRole;
  status: UserStatus;
  accountType: AccountType;
  language: AppLanguage;
  phoneNumber?: string | null;
  costCenterId?: string | null;
  tenantId?: string | null;
  corpClientId?: string | null;
  tokenLabel?: string | null;
  apiClientId?: string | null;
  clientRoleId?: string | null;
}) {
  return {
    crmManaged: true,
    crmPublicUserId: input.publicUserId,
    crmName: input.name,
    crmRole: input.role,
    crmStatus: input.status,
    crmAccountType: input.accountType,
    crmLanguage: input.language,
    crmPhoneNumber: input.phoneNumber ?? null,
    crmCostCenterId: input.costCenterId ?? null,
    crmTenantId: input.tenantId ?? null,
    crmCorpClientId: input.corpClientId ?? null,
    crmTokenLabel: input.tokenLabel ?? null,
    crmApiClientId: input.apiClientId ?? null,
    crmClientRoleId: input.clientRoleId ?? null,
  } satisfies SupabaseAuthMetadata;
}

function canUseDevelopmentFallback() {
  return process.env.NODE_ENV !== "production";
}

function getDevelopmentFallbackStore() {
  if (!fallbackMemoryStore) {
    fallbackMemoryStore = createDefaultStore();
  }
  fallbackMemoryStore = normalizeStore(fallbackMemoryStore);
  return fallbackMemoryStore;
}

function shouldUseDevelopmentFallbackStore() {
  return canUseDevelopmentFallback() && fallbackMemoryStore != null;
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
            id: user.id || DEFAULT_ADMIN_PUBLIC_ID,
            name: DEFAULT_ADMIN_NAME,
            role: "Admin" as const,
            status: "approved" as const,
            accountType: "internal" as const,
            language: normalizeLanguage(user.language),
          }
        : user,
    );
  }

  return [
    ...users,
    {
      id: DEFAULT_ADMIN_PUBLIC_ID,
      authUserId: null,
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "Admin",
      status: "approved",
      createdAt: new Date().toISOString(),
      accountType: "internal",
      language: DEFAULT_LANGUAGE,
    },
  ];
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

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
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

function normalizeStore(data: Partial<AuthStoreData> | null | undefined): AuthStoreData {
  const base = createDefaultStore();
  if (!data) return base;

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
              authUserId: typeof item.authUserId === "string" ? item.authUserId : null,
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
  const mergedUserPerms = {
    ...base.rolePermissions.User,
    ...(data.rolePermissions?.User ?? {}),
  };
  const userPerms =
    storedVersion < CURRENT_PERMISSIONS_VERSION
      ? {
          ...mergedUserPerms,
          orders: true,
          preOrders: true,
          communications: true,
          financialCenter: true,
        }
      : mergedUserPerms;

  return {
    users,
    rolePermissions: {
      Admin: { ...base.rolePermissions.Admin, ...(data.rolePermissions?.Admin ?? {}) },
      User: userPerms,
      "Team Lead": {
        ...base.rolePermissions["Team Lead"],
        ...(data.rolePermissions?.["Team Lead"] ?? {}),
      },
    },
    roleAreaAccess: {
      Admin: { ...base.roleAreaAccess.Admin, ...(data.roleAreaAccess?.Admin ?? {}) },
      User: { ...base.roleAreaAccess.User, ...(data.roleAreaAccess?.User ?? {}) },
      "Team Lead": {
        ...base.roleAreaAccess["Team Lead"],
        ...(data.roleAreaAccess?.["Team Lead"] ?? {}),
      },
    },
    roleDashboardBlockAccess: {
      Admin: {
        ...base.roleDashboardBlockAccess.Admin,
        ...(data.roleDashboardBlockAccess?.Admin ?? {}),
      },
      User: {
        ...base.roleDashboardBlockAccess.User,
        ...(data.roleDashboardBlockAccess?.User ?? {}),
      },
      "Team Lead": {
        ...base.roleDashboardBlockAccess["Team Lead"],
        ...(data.roleDashboardBlockAccess?.["Team Lead"] ?? {}),
      },
    },
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

async function loadLegacyStoreForFallback(): Promise<AuthStoreData> {
  if (canUseKv()) {
    try {
      const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
      return normalizeStore(raw);
    } catch {
      // Fall back to in-memory/default store below.
    }
  }
  if (fallbackMemoryStore) {
    return normalizeStore(fallbackMemoryStore);
  }
  return createDefaultStore();
}

function mergeUsersByIdOrEmail(primaryUsers: AuthUser[], fallbackUsers: AuthUser[]) {
  const merged = new Map<string, AuthUser>();
  for (const user of fallbackUsers) {
    const key = user.id || user.email.trim().toLowerCase();
    merged.set(key, user);
  }
  for (const user of primaryUsers) {
    const byIdKey = user.id || user.email.trim().toLowerCase();
    const byEmailKey = user.email.trim().toLowerCase();
    const fallback =
      merged.get(byIdKey) ??
      Array.from(merged.values()).find((item) => item.email.trim().toLowerCase() === byEmailKey) ??
      null;
    merged.set(byIdKey, {
      ...fallback,
      ...user,
      id: user.id || fallback?.id || `user-${crypto.randomUUID()}`,
      email: user.email.trim().toLowerCase(),
    });
  }
  return Array.from(merged.values());
}

function mapAuthMetadataUserToAuthUser(input: {
  authUserId: string;
  email: string;
  createdAt?: string | null;
  metadata: Record<string, unknown> | null | undefined;
}): AuthUser {
  const metadata = (input.metadata ?? {}) as SupabaseAuthMetadata;
  return {
    id:
      typeof metadata.crmPublicUserId === "string" && metadata.crmPublicUserId
        ? metadata.crmPublicUserId
        : `user-${input.authUserId}`,
    authUserId: input.authUserId,
    name:
      typeof metadata.crmName === "string" && metadata.crmName.trim()
        ? metadata.crmName.trim()
        : input.email.split("@")[0] || "User",
    email: input.email.trim().toLowerCase(),
    password: "",
    role: isAppRole(metadata.crmRole) ? metadata.crmRole : "User",
    status: isUserStatus(metadata.crmStatus) ? metadata.crmStatus : "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
    accountType: normalizeAccountType(metadata.crmAccountType),
    phoneNumber:
      typeof metadata.crmPhoneNumber === "string" ? metadata.crmPhoneNumber : null,
    costCenterId:
      typeof metadata.crmCostCenterId === "string" ? metadata.crmCostCenterId : null,
    tenantId: typeof metadata.crmTenantId === "string" ? metadata.crmTenantId : null,
    corpClientId:
      typeof metadata.crmCorpClientId === "string" ? metadata.crmCorpClientId : null,
    tokenLabel: typeof metadata.crmTokenLabel === "string" ? metadata.crmTokenLabel : null,
    apiClientId: typeof metadata.crmApiClientId === "string" ? metadata.crmApiClientId : null,
    clientRoleId:
      typeof metadata.crmClientRoleId === "string" ? metadata.crmClientRoleId : null,
    language: normalizeLanguage(metadata.crmLanguage),
  };
}

function mapProfileRowToUser(row: AuthProfileRow): AuthUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name,
    email: row.email,
    password: "",
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    accountType: row.account_type,
    phoneNumber: row.phone_number,
    costCenterId: row.cost_center_id,
    tenantId: row.tenant_id,
    corpClientId: row.corp_client_id,
    tokenLabel: row.token_label,
    apiClientId: row.api_client_id,
    clientRoleId: row.client_role_id,
    language: row.language,
  };
}

async function listAllAuthUsers(supabase: SupabaseAdminClient) {
  const users: Array<{ id: string; email: string }> = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    const batch = (data?.users ?? []).map((user) => ({
      id: user.id,
      email: String(user.email ?? "").trim().toLowerCase(),
    }));
    users.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

async function listAllAuthUsersDetailed(supabase: SupabaseAdminClient) {
  const users: Array<{
    id: string;
    email: string;
    createdAt: string | null;
    metadata: Record<string, unknown> | null | undefined;
  }> = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    const batch = (data?.users ?? [])
      .map((user) => ({
        id: user.id,
        email: String(user.email ?? "").trim().toLowerCase(),
        createdAt: typeof user.created_at === "string" ? user.created_at : null,
        metadata:
          user.user_metadata && typeof user.user_metadata === "object"
            ? (user.user_metadata as Record<string, unknown>)
            : null,
      }))
      .filter((user) => user.email);
    users.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

async function findAuthUserByEmail(supabase: SupabaseAdminClient, email: string) {
  const users = await listAllAuthUsers(supabase);
  const normalized = email.trim().toLowerCase();
  return users.find((item) => item.email === normalized) ?? null;
}

async function loadProfiles(supabase: SupabaseAdminClient): Promise<AuthUser[]> {
  const { data, error } = await supabase
    .from("crm_user_profiles")
    .select(
      "id,auth_user_id,email,name,role,status,account_type,phone_number,cost_center_id,tenant_id,corp_client_id,token_label,api_client_id,client_role_id,language,created_at,updated_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load CRM user profiles: ${error.message}`);
  return ((data ?? []) as AuthProfileRow[]).map(mapProfileRowToUser);
}

async function loadRolePermissions(supabase: SupabaseAdminClient): Promise<RolePermissions> {
  const { data, error } = await supabase
    .from("crm_role_permissions")
    .select("role,permissions");
  if (error) throw new Error(`Failed to load role permissions: ${error.message}`);
  const base = { ...defaultRolePermissions };
  for (const row of (data ?? []) as RoleJsonRow[]) {
    if (!isAppRole(row.role)) continue;
    base[row.role] = {
      ...base[row.role],
      ...((row.permissions as Record<string, boolean> | undefined) ?? {}),
    };
  }
  return base;
}

async function loadRoleAreaAccess(supabase: SupabaseAdminClient): Promise<RoleAreaAccess> {
  const { data, error } = await supabase
    .from("crm_role_area_access")
    .select("role,area_access");
  if (error) throw new Error(`Failed to load role area access: ${error.message}`);
  const base = { ...defaultRoleAreaAccess };
  for (const row of (data ?? []) as RoleJsonRow[]) {
    if (!isAppRole(row.role)) continue;
    base[row.role] = {
      ...base[row.role],
      ...((row.area_access as Record<string, boolean> | undefined) ?? {}),
    };
  }
  return base;
}

async function loadRoleDashboardAccess(
  supabase: SupabaseAdminClient,
): Promise<RoleDashboardBlockAccess> {
  const { data, error } = await supabase
    .from("crm_role_dashboard_block_access")
    .select("role,dashboard_block_access");
  if (error) throw new Error(`Failed to load dashboard block access: ${error.message}`);
  const base = { ...defaultRoleDashboardBlockAccess };
  for (const row of (data ?? []) as RoleJsonRow[]) {
    if (!isAppRole(row.role)) continue;
    base[row.role] = {
      ...base[row.role],
      ...((row.dashboard_block_access as Record<string, boolean> | undefined) ?? {}),
    };
  }
  return base;
}

async function loadTenantAccounts(supabase: SupabaseAdminClient): Promise<TenantAccount[]> {
  const { data, error } = await supabase
    .from("crm_tenant_accounts")
    .select(
      "id,name,corp_client_id,token_label,api_client_id,default_cost_center_id,pinned_default_cost_center_id,b2c_enabled,b2c_token,b2c_client_id,b2c_ride_class,b2c_create_endpoint,client_portal_communications_enabled,client_portal_financial_center_enabled,enabled,created_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load tenant accounts: ${error.message}`);
  return normalizeTenantAccounts(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id,
      name: row.name,
      corpClientId: row.corp_client_id,
      tokenLabel: row.token_label,
      apiClientId: row.api_client_id,
      defaultCostCenterId: row.default_cost_center_id,
      pinnedDefaultCostCenterId: row.pinned_default_cost_center_id,
      b2cEnabled: row.b2c_enabled,
      b2cToken: row.b2c_token,
      b2cClientId: row.b2c_client_id,
      b2cRideClass: row.b2c_ride_class,
      b2cCreateEndpoint: row.b2c_create_endpoint,
      clientPortalCommunicationsEnabled: row.client_portal_communications_enabled,
      clientPortalFinancialCenterEnabled: row.client_portal_financial_center_enabled,
      enabled: row.enabled,
      createdAt: row.created_at,
    })),
  );
}

async function loadTenantRoles(
  supabase: SupabaseAdminClient,
  tenantAccounts: TenantAccount[],
): Promise<Record<string, ClientRoleDefinition[]>> {
  const { data, error } = await supabase.from("crm_tenant_roles").select("tenant_id,roles");
  if (error) throw new Error(`Failed to load tenant roles: ${error.message}`);
  const raw: Record<string, unknown> = {};
  for (const row of (data ?? []) as TenantRolesRow[]) {
    raw[row.tenant_id] = row.roles;
  }
  return normalizeTenantRoles(raw, tenantAccounts);
}

async function loadGlobalB2CSettings(
  supabase: SupabaseAdminClient,
): Promise<GlobalB2CFallbackSettings> {
  const { data, error } = await supabase
    .from("crm_global_b2c_settings")
    .select("enabled,token,client_id,ride_class,create_endpoint")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load global B2C settings: ${error.message}`);
  return {
    enabled: data?.enabled === true,
    token: typeof data?.token === "string" ? data.token : null,
    clientId: typeof data?.client_id === "string" ? data.client_id : null,
    rideClass: typeof data?.ride_class === "string" ? data.ride_class : "comfortplus",
    createEndpoint: typeof data?.create_endpoint === "string" ? data.create_endpoint : null,
  };
}

async function loadAuthStoreFromSupabaseAuthFallback(
  supabase: SupabaseAdminClient,
): Promise<AuthStoreData> {
  const legacyStore = await loadLegacyStoreForFallback();
  const detailedUsers = await listAllAuthUsersDetailed(supabase);
  const authUsers = detailedUsers
    .filter((user) => user.metadata?.crmManaged === true)
    .map((user) =>
      mapAuthMetadataUserToAuthUser({
        authUserId: user.id,
        email: user.email,
        createdAt: user.createdAt,
        metadata: user.metadata,
      }),
    );
  return normalizeStore({
    ...legacyStore,
    users: mergeUsersByIdOrEmail(authUsers, legacyStore.users ?? []),
  });
}

async function ensureDefaultSettings(supabase: SupabaseAdminClient) {
  const rolePermissionRows = Object.entries(defaultRolePermissions).map(([role, permissions]) => ({
    role,
    permissions,
    updated_at: new Date().toISOString(),
  }));
  const roleAreaRows = Object.entries(defaultRoleAreaAccess).map(([role, areaAccess]) => ({
    role,
    area_access: areaAccess,
    updated_at: new Date().toISOString(),
  }));
  const roleDashboardRows = Object.entries(defaultRoleDashboardBlockAccess).map(([role, access]) => ({
    role,
    dashboard_block_access: access,
    updated_at: new Date().toISOString(),
  }));
  const { error: rolePermsError } = await supabase
    .from("crm_role_permissions")
    .upsert(rolePermissionRows, { onConflict: "role" });
  if (rolePermsError) {
    throw new Error(`Failed to seed role permissions: ${rolePermsError.message}`);
  }
  const { error: roleAreaError } = await supabase
    .from("crm_role_area_access")
    .upsert(roleAreaRows, { onConflict: "role" });
  if (roleAreaError) {
    throw new Error(`Failed to seed role area access: ${roleAreaError.message}`);
  }
  const { error: roleDashboardError } = await supabase
    .from("crm_role_dashboard_block_access")
    .upsert(roleDashboardRows, { onConflict: "role" });
  if (roleDashboardError) {
    throw new Error(`Failed to seed role dashboard block access: ${roleDashboardError.message}`);
  }
  const { error: globalSettingsError } = await supabase.from("crm_global_b2c_settings").upsert(
    {
      id: 1,
      enabled: false,
      token: null,
      client_id: null,
      ride_class: "comfortplus",
      create_endpoint: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (globalSettingsError) {
    throw new Error(`Failed to seed global B2C settings: ${globalSettingsError.message}`);
  }
}

async function ensureDefaultAdminSeeded(supabase: SupabaseAdminClient) {
  const { count, error } = await supabase
    .from("crm_user_profiles")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Failed to inspect CRM user profiles: ${error.message}`);
  if ((count ?? 0) > 0) return;

  const existingAuthUser = await findAuthUserByEmail(supabase, DEFAULT_ADMIN_EMAIL);
  let authUserId = typeof existingAuthUser?.id === "string" ? existingAuthUser.id : null;

  if (!authUserId) {
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { source: "default_admin_seed" },
    });
    if (createError || !data.user?.id) {
      throw new Error(`Failed to seed default admin auth user: ${createError?.message ?? "unknown"}`);
    }
    authUserId = data.user.id;
  } else {
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
      password: DEFAULT_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { source: "default_admin_seed" },
    });
    if (updateError) {
      throw new Error(`Failed to refresh default admin password: ${updateError.message}`);
    }
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("crm_user_profiles").upsert(
    {
      id: DEFAULT_ADMIN_PUBLIC_ID,
      auth_user_id: authUserId,
      email: DEFAULT_ADMIN_EMAIL,
      name: DEFAULT_ADMIN_NAME,
      role: "Admin",
      status: "approved",
      account_type: "internal",
      language: DEFAULT_LANGUAGE,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new Error(`Failed to seed default admin profile: ${profileError.message}`);
  }
}

async function ensureDefaultAdminAuthFallbackSeeded(supabase: SupabaseAdminClient) {
  const existingAuthUser = await findAuthUserByEmail(supabase, DEFAULT_ADMIN_EMAIL);
  const metadata = buildSupabaseAuthMetadata({
    publicUserId: DEFAULT_ADMIN_PUBLIC_ID,
    name: DEFAULT_ADMIN_NAME,
    role: "Admin",
    status: "approved",
    accountType: "internal",
    language: DEFAULT_LANGUAGE,
  });

  if (!existingAuthUser?.id) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user?.id) {
      throw new Error(`Failed to seed default admin auth user: ${error?.message ?? "unknown"}`);
    }
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
    password: DEFAULT_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) {
    throw new Error(`Failed to refresh default admin auth user: ${error.message}`);
  }
}

async function ensureSupabaseAuthStoreInitialized(supabase: SupabaseAdminClient) {
  await ensureDefaultSettings(supabase);
  await ensureDefaultAdminSeeded(supabase);
}

function toTenantAccountRows(tenantAccounts: TenantAccount[]) {
  const now = new Date().toISOString();
  return tenantAccounts.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    corp_client_id: tenant.corpClientId,
    token_label: tenant.tokenLabel,
    api_client_id: tenant.apiClientId,
    default_cost_center_id: tenant.defaultCostCenterId ?? null,
    pinned_default_cost_center_id: tenant.pinnedDefaultCostCenterId ?? null,
    b2c_enabled: tenant.b2cEnabled === true,
    b2c_token: tenant.b2cToken ?? null,
    b2c_client_id: tenant.b2cClientId ?? null,
    b2c_ride_class: tenant.b2cRideClass ?? "comfortplus",
    b2c_create_endpoint: tenant.b2cCreateEndpoint ?? null,
    client_portal_communications_enabled: tenant.clientPortalCommunicationsEnabled !== false,
    client_portal_financial_center_enabled: tenant.clientPortalFinancialCenterEnabled !== false,
    enabled: tenant.enabled !== false,
    created_at: tenant.createdAt || now,
    updated_at: now,
  }));
}

function toProfileRows(users: AuthUser[]) {
  const now = new Date().toISOString();
  return users.map((user) => {
    if (!user.authUserId) {
      throw new Error(`User ${user.email} is missing authUserId; cannot save profile.`);
    }
    return {
      id: user.id,
      auth_user_id: user.authUserId,
      email: user.email.trim().toLowerCase(),
      name: user.name,
      role: user.role,
      status: user.status,
      account_type: normalizeAccountType(user.accountType),
      phone_number: user.phoneNumber ?? null,
      cost_center_id: user.costCenterId ?? null,
      tenant_id: user.tenantId ?? null,
      corp_client_id: user.corpClientId ?? null,
      token_label: user.tokenLabel ?? null,
      api_client_id: user.apiClientId ?? null,
      client_role_id: user.clientRoleId ?? null,
      language: normalizeLanguage(user.language),
      created_at: user.createdAt || now,
      updated_at: now,
    };
  });
}

async function deleteRemovedProfiles(
  supabase: SupabaseAdminClient,
  users: AuthUser[],
) {
  const wantedIds = new Set(users.map((user) => user.id));
  const { data, error } = await supabase.from("crm_user_profiles").select("id,auth_user_id");
  if (error) throw new Error(`Failed to inspect stored profiles: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; auth_user_id: string }>;
  for (const row of rows) {
    if (wantedIds.has(row.id)) continue;
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(row.auth_user_id);
    if (deleteAuthError) {
      throw new Error(`Failed to delete auth user ${row.id}: ${deleteAuthError.message}`);
    }
  }
}

export async function loadAuthStoreFromSupabase(): Promise<AuthStoreData> {
  const supabase = getSupabaseAdminClient();
  try {
    await ensureSupabaseAuthStoreInitialized(supabase);
    const [
      users,
      rolePermissions,
      roleAreaAccess,
      roleDashboardBlockAccess,
      tenantAccounts,
      globalB2CSettings,
    ] = await Promise.all([
      loadProfiles(supabase),
      loadRolePermissions(supabase),
      loadRoleAreaAccess(supabase),
      loadRoleDashboardAccess(supabase),
      loadTenantAccounts(supabase),
      loadGlobalB2CSettings(supabase),
    ]);
    const tenantRoles = await loadTenantRoles(supabase, tenantAccounts);
    return normalizeStore({
      users,
      rolePermissions,
      roleAreaAccess,
      roleDashboardBlockAccess,
      tenantAccounts,
      tenantRoles,
      globalB2CSettings,
      storeMeta: { permissionsVersion: CURRENT_PERMISSIONS_VERSION },
    });
  } catch (error) {
    if (!isMissingSupabaseAuthSchemaError(error)) {
      throw error;
    }
    await ensureDefaultAdminAuthFallbackSeeded(supabase);
    return loadAuthStoreFromSupabaseAuthFallback(supabase);
  }
}

export async function saveAuthStoreToSupabase(data: AuthStoreData): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const normalized = normalizeStore(data);
  await deleteRemovedProfiles(supabase, normalized.users);

  const profileRows = toProfileRows(normalized.users);
  if (profileRows.length > 0) {
    const { error } = await supabase.from("crm_user_profiles").upsert(profileRows, {
      onConflict: "id",
    });
    if (error) throw new Error(`Failed to save CRM user profiles: ${error.message}`);
  }

  const now = new Date().toISOString();
  const rolePermissionsRows = Object.entries(normalized.rolePermissions).map(
    ([role, permissions]) => ({ role, permissions, updated_at: now }),
  );
  const roleAreaRows = Object.entries(normalized.roleAreaAccess).map(([role, areaAccess]) => ({
    role,
    area_access: areaAccess,
    updated_at: now,
  }));
  const dashboardRows = Object.entries(normalized.roleDashboardBlockAccess).map(
    ([role, dashboardBlockAccess]) => ({
      role,
      dashboard_block_access: dashboardBlockAccess,
      updated_at: now,
    }),
  );

  const { error: rolePermissionsError } = await supabase
    .from("crm_role_permissions")
    .upsert(rolePermissionsRows, { onConflict: "role" });
  if (rolePermissionsError) {
    throw new Error(`Failed to save role permissions: ${rolePermissionsError.message}`);
  }
  const { error: roleAreaError } = await supabase
    .from("crm_role_area_access")
    .upsert(roleAreaRows, { onConflict: "role" });
  if (roleAreaError) {
    throw new Error(`Failed to save role area access: ${roleAreaError.message}`);
  }
  const { error: dashboardAccessError } = await supabase
    .from("crm_role_dashboard_block_access")
    .upsert(dashboardRows, { onConflict: "role" });
  if (dashboardAccessError) {
    throw new Error(
      `Failed to save role dashboard block access: ${dashboardAccessError.message}`,
    );
  }

  const tenantAccountRows = toTenantAccountRows(normalized.tenantAccounts ?? []);
  const { data: existingTenants, error: existingTenantsError } = await supabase
    .from("crm_tenant_accounts")
    .select("id");
  if (existingTenantsError) {
    throw new Error(`Failed to inspect tenant accounts: ${existingTenantsError.message}`);
  }
  const wantedTenantIds = new Set(tenantAccountRows.map((row) => row.id));
  const toDeleteTenantIds = ((existingTenants ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => !wantedTenantIds.has(id));
  if (toDeleteTenantIds.length > 0) {
    const { error: deleteTenantError } = await supabase
      .from("crm_tenant_accounts")
      .delete()
      .in("id", toDeleteTenantIds);
    if (deleteTenantError) {
      throw new Error(`Failed to delete tenant accounts: ${deleteTenantError.message}`);
    }
  }
  if (tenantAccountRows.length > 0) {
    const { error: tenantUpsertError } = await supabase
      .from("crm_tenant_accounts")
      .upsert(tenantAccountRows, { onConflict: "id" });
    if (tenantUpsertError) {
      throw new Error(`Failed to save tenant accounts: ${tenantUpsertError.message}`);
    }
  }

  const tenantRoleRows = Object.entries(normalized.tenantRoles ?? {}).map(([tenantId, roles]) => ({
    tenant_id: tenantId,
    roles,
    updated_at: now,
  }));
  const { data: existingTenantRoles, error: existingTenantRolesError } = await supabase
    .from("crm_tenant_roles")
    .select("tenant_id");
  if (existingTenantRolesError) {
    throw new Error(`Failed to inspect tenant roles: ${existingTenantRolesError.message}`);
  }
  const wantedTenantRoleIds = new Set(tenantRoleRows.map((row) => row.tenant_id));
  const tenantRolesToDelete = ((existingTenantRoles ?? []) as Array<{ tenant_id: string }>)
    .map((row) => row.tenant_id)
    .filter((id) => !wantedTenantRoleIds.has(id));
  if (tenantRolesToDelete.length > 0) {
    const { error: deleteTenantRolesError } = await supabase
      .from("crm_tenant_roles")
      .delete()
      .in("tenant_id", tenantRolesToDelete);
    if (deleteTenantRolesError) {
      throw new Error(`Failed to delete tenant roles: ${deleteTenantRolesError.message}`);
    }
  }
  if (tenantRoleRows.length > 0) {
    const { error: tenantRolesUpsertError } = await supabase
      .from("crm_tenant_roles")
      .upsert(tenantRoleRows, { onConflict: "tenant_id" });
    if (tenantRolesUpsertError) {
      throw new Error(`Failed to save tenant roles: ${tenantRolesUpsertError.message}`);
    }
  }

  const globalSettings = normalized.globalB2CSettings ?? {
    enabled: false,
    token: null,
    clientId: null,
    rideClass: "comfortplus",
    createEndpoint: null,
  };
  const { error: globalSettingsError } = await supabase.from("crm_global_b2c_settings").upsert(
    {
      id: 1,
      enabled: globalSettings.enabled === true,
      token: globalSettings.token ?? null,
      client_id: globalSettings.clientId ?? null,
      ride_class: globalSettings.rideClass ?? "comfortplus",
      create_endpoint: globalSettings.createEndpoint ?? null,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (globalSettingsError) {
    throw new Error(`Failed to save global B2C settings: ${globalSettingsError.message}`);
  }
}

export async function saveAuthUsersToSupabaseAuthFallback(data: AuthStoreData): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const normalized = normalizeStore(data);
  const existingUsers = await listAllAuthUsersDetailed(supabase);
  const existingByEmail = new Map(existingUsers.map((user) => [user.email, user]));
  const existingByPublicUserId = new Map(
    existingUsers
      .filter((user) => typeof user.metadata?.crmPublicUserId === "string")
      .map((user) => [String(user.metadata?.crmPublicUserId), user]),
  );

  for (const user of normalized.users) {
    const metadata = buildSupabaseAuthMetadata({
      publicUserId: user.id,
      name: user.name,
      role: user.role,
      status: user.status,
      accountType: normalizeAccountType(user.accountType),
      language: normalizeLanguage(user.language),
      phoneNumber: user.phoneNumber ?? null,
      costCenterId: user.costCenterId ?? null,
      tenantId: user.tenantId ?? null,
      corpClientId: user.corpClientId ?? null,
      tokenLabel: user.tokenLabel ?? null,
      apiClientId: user.apiClientId ?? null,
      clientRoleId: user.clientRoleId ?? null,
    });
    const existing =
      (user.authUserId ? existingUsers.find((item) => item.id === user.authUserId) : null) ??
      existingByPublicUserId.get(user.id) ??
      existingByEmail.get(user.email.trim().toLowerCase()) ??
      null;

    if (existing) {
      const updatePayload: {
        email?: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata: SupabaseAuthMetadata;
      } = {
        email: user.email.trim().toLowerCase(),
        email_confirm: true,
        user_metadata: metadata,
      };
      if (user.password.trim()) {
        updatePayload.password = user.password;
      }
      const { error } = await supabase.auth.admin.updateUserById(existing.id, updatePayload);
      if (error) {
        throw new Error(`Failed to sync auth user ${user.email}: ${error.message}`);
      }
      continue;
    }

    if (!user.password.trim()) {
      throw new Error(`Cannot create missing Supabase auth user for ${user.email} without password.`);
    }
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: user.email.trim().toLowerCase(),
      password: user.password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !created.user?.id) {
      throw new Error(`Failed to create auth user ${user.email}: ${error?.message ?? "unknown"}`);
    }
  }

  const wantedIds = new Set(normalized.users.map((user) => user.id));
  const managedToDelete = existingUsers.filter(
    (user) => user.metadata?.crmManaged === true && !wantedIds.has(String(user.metadata?.crmPublicUserId ?? "")),
  );
  for (const user of managedToDelete) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      throw new Error(`Failed to delete auth user ${user.email}: ${error.message}`);
    }
  }
}

export async function loadAuthStore(): Promise<AuthStoreData> {
  if (!isSupabaseConfigured()) {
    if (canUseDevelopmentFallback()) {
      return getDevelopmentFallbackStore();
    }
    throw new Error(
      "Supabase auth store is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  try {
    return await loadAuthStoreFromSupabase();
  } catch (error) {
    if (canUseDevelopmentFallback()) {
      return getDevelopmentFallbackStore();
    }
    throw error;
  }
}

export async function saveAuthStore(data: AuthStoreData): Promise<void> {
  const normalized = normalizeStore(data);
  if (!isSupabaseConfigured()) {
    if (canUseDevelopmentFallback()) {
      fallbackMemoryStore = normalized;
      return;
    }
    throw new Error(
      "Supabase auth store is not configured. Cannot save CRM auth state without Supabase.",
    );
  }
  try {
    await saveAuthStoreToSupabase(normalized);
  } catch (error) {
    if (canUseDevelopmentFallback()) {
      fallbackMemoryStore = normalized;
      return;
    }
    throw error;
  }
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

export async function createAuthBackedUser(input: AuthUserInput): Promise<AuthUser> {
  if ((!isSupabaseConfigured() && canUseDevelopmentFallback()) || shouldUseDevelopmentFallbackStore()) {
    const fallbackUser: AuthUser = {
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
    return fallbackUser;
  }
  const supabase = getSupabaseAdminClient();
  const normalizedEmail = input.email.trim().toLowerCase();
  const publicUserId = input.publicUserId ?? `user-${crypto.randomUUID()}`;
  const metadata = buildSupabaseAuthMetadata({
    publicUserId,
    name: input.name.trim(),
    role: input.role,
    status: input.status,
    accountType: normalizeAccountType(input.accountType),
    language: normalizeLanguage(input.language),
    phoneNumber: input.phoneNumber ?? null,
    costCenterId: input.costCenterId ?? null,
    tenantId: input.tenantId ?? null,
    corpClientId: input.corpClientId ?? null,
    tokenLabel: input.tokenLabel ?? null,
    apiClientId: input.apiClientId ?? null,
    clientRoleId: input.clientRoleId ?? null,
  });
  let authUserId: string | null = null;
  let createdNewAuthUser = false;
  try {
    const existingAuthUser = await findAuthUserByEmail(supabase, normalizedEmail);
    if (existingAuthUser?.id) {
      authUserId = existingAuthUser.id;
      const { error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
        password: input.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) {
        throw error;
      }
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: input.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error || !data.user?.id) {
        throw error ?? new Error("Failed to create auth user: unknown error");
      }
      authUserId = data.user.id;
      createdNewAuthUser = true;
    }
  } catch (error) {
    if (canUseDevelopmentFallback()) {
      return {
        id: publicUserId,
        authUserId: null,
        name: input.name.trim(),
        email: normalizedEmail,
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
    throw error;
  }
  if (!authUserId) {
    if (canUseDevelopmentFallback()) {
      return {
        id: publicUserId,
        authUserId: null,
        name: input.name.trim(),
        email: normalizedEmail,
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
    throw new Error("Failed to create auth user: unknown error");
  }

  const user: AuthUser = {
    id: publicUserId,
    authUserId,
    name: input.name.trim(),
    email: normalizedEmail,
    password: "",
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

  const { error: profileError } = await supabase.from("crm_user_profiles").insert(
    toProfileRows([user])[0],
  );
  if (profileError) {
    if (isMissingSupabaseAuthSchemaMessage(profileError.message)) {
      return user;
    }
    if (createdNewAuthUser) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
    if (canUseDevelopmentFallback()) {
      return {
        ...user,
        authUserId: null,
        password: input.password,
      };
    }
    throw new Error(`Failed to create CRM user profile: ${profileError.message}`);
  }

  return user;
}

export async function updateAuthUserPassword(authUserId: string, password: string): Promise<void> {
  if ((!authUserId && canUseDevelopmentFallback()) || shouldUseDevelopmentFallbackStore()) {
    return;
  }
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new Error(`Failed to update auth password: ${error.message}`);
}

export async function deleteAuthBackedUser(publicUserId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_user_profiles")
    .select("auth_user_id")
    .eq("id", publicUserId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load profile for deletion: ${error.message}`);
  if (!data?.auth_user_id) return;
  const { error: deleteError } = await supabase.auth.admin.deleteUser(data.auth_user_id);
  if (deleteError) throw new Error(`Failed to delete auth user: ${deleteError.message}`);
}

export async function verifyLoginCredentials(email: string, password: string): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isSupabaseConfigured()) {
    const store = await loadAuthStore();
    return (
      store.users.find(
        (user) =>
          user.email.trim().toLowerCase() === normalizedEmail &&
          user.password === password,
      ) ?? null
    );
  }

  try {
    const anonClient = getSupabaseServerClient();
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error || !data.user?.id) {
      if (canUseDevelopmentFallback()) {
        const store = await loadAuthStore();
        return (
          store.users.find(
            (user) =>
              user.email.trim().toLowerCase() === normalizedEmail &&
              user.password === password &&
              user.status === "approved",
          ) ?? null
        );
      }
      return null;
    }
    const { error: signOutError } = await anonClient.auth.signOut();
    if (signOutError) {
      // Ignore sign-out failure since this client is stateless server-side.
    }
    const store = await loadAuthStoreFromSupabase();
    return (
      store.users.find(
        (user) =>
          user.authUserId === data.user.id &&
          user.email.trim().toLowerCase() === normalizedEmail,
      ) ?? null
    );
  } catch (error) {
    if (canUseDevelopmentFallback()) {
      const store = await loadAuthStore();
      return (
        store.users.find(
          (user) =>
            user.email.trim().toLowerCase() === normalizedEmail &&
            user.password === password,
        ) ?? null
      );
    }
    throw error;
  }
}

export async function upsertExistingAuthUserProfile(input: AuthUser): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const rows = toProfileRows([input]);
  const { error } = await supabase.from("crm_user_profiles").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert CRM user profile: ${error.message}`);
}
