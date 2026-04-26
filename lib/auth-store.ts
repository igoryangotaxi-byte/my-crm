import { kv } from "@vercel/kv";
import {
  type AppRole,
  type AuthStoreData,
  type AuthUser,
  type UserStatus,
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
const CURRENT_PERMISSIONS_VERSION = 3;

function createDefaultStore(): AuthStoreData {
  return {
    users: seedDefaultUsers(),
    rolePermissions: defaultRolePermissions,
    roleAreaAccess: defaultRoleAreaAccess,
    roleDashboardBlockAccess: defaultRoleDashboardBlockAccess,
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

function normalizeStore(data: Partial<AuthStoreData> | null | undefined): AuthStoreData {
  const base = createDefaultStore();
  if (!data) {
    return base;
  }

  const users =
    Array.isArray(data.users) && data.users.length > 0
      ? ensureDefaultAdmin(data.users.filter(isAuthUser))
      : base.users;

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
