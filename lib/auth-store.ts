import { kv } from "@vercel/kv";
import {
  type AccountType,
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

const AUTH_STORE_KEY = "appli:auth:store:v1";
const DEFAULT_ADMIN_EMAIL = "ig-kuznetsov@yandex-team.ru";
const DEFAULT_ADMIN_PASSWORD = "123";
const DEFAULT_ADMIN_NAME = "Igor Kuznetsov";

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

/** v2 first migration; v3 fixes stores that already had meta v2 but User.orders/preOrders stayed false. */
const CURRENT_PERMISSIONS_VERSION = 4;

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
    storeMeta: { permissionsVersion: CURRENT_PERMISSIONS_VERSION },
  };
}

function isAppRole(value: unknown): value is AppRole {
  return value === "Admin" || value === "User" || value === "Team Lead";
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === "pending" || value === "approved" || value === "rejected";
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

  const users =
    Array.isArray(data.users) && data.users.length > 0
      ? ensureDefaultAdmin(
          data.users.filter(isAuthUser).map((item) => ({
            ...item,
            accountType: normalizeAccountType(item.accountType),
            tenantId: item.tenantId ?? null,
            corpClientId: item.corpClientId ?? null,
            tokenLabel: item.tokenLabel ?? null,
            apiClientId: item.apiClientId ?? null,
            clientRoleId: item.clientRoleId ?? null,
          })),
        )
      : base.users;
  const tenantAccounts = normalizeTenantAccounts(data.tenantAccounts);
  const tenantRoles = normalizeTenantRoles(data.tenantRoles, tenantAccounts);

  const storedVersion = data.storeMeta?.permissionsVersion ?? 0;
  const mergedUserPerms = {
    ...base.rolePermissions.User,
    ...(data.rolePermissions?.User ?? {}),
  };
  /** Older KV had User.orders/preOrders false; v3 re-applies after some stores hit meta v2 without fixing User. */
  const userPerms =
    storedVersion < CURRENT_PERMISSIONS_VERSION
      ? { ...mergedUserPerms, orders: true, preOrders: true }
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
    storeMeta: {
      permissionsVersion: Math.max(storedVersion, CURRENT_PERMISSIONS_VERSION),
    },
  };
}

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function loadAuthStore(): Promise<AuthStoreData> {
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

export async function saveAuthStore(data: AuthStoreData): Promise<void> {
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
