import { NextResponse } from "next/server";
import { loadAuthStore, saveAuthStore } from "@/lib/auth-store";
import { getRequestUser } from "@/lib/server-auth";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/server-session";
import {
  type AuthApiActionRequest,
  type AuthStoreData,
  type ClientPortalPageKey,
  defaultClientPortalPermissions,
} from "@/types/auth";

type AuthActionResponse = {
  ok: boolean;
  message?: string;
  userId?: string;
  data?: AuthStoreData;
};

function sanitizeStore(data: AuthStoreData): AuthStoreData {
  return {
    ...data,
    users: data.users.map((user) => ({ ...user, password: "" })),
  };
}

function isInternalAdmin(user: Awaited<ReturnType<typeof getRequestUser>>) {
  return Boolean(user && user.accountType !== "client" && user.role === "Admin");
}

function hasTenantEmployeesPermission(user: Awaited<ReturnType<typeof getRequestUser>>, store: AuthStoreData) {
  if (!user || user.accountType !== "client" || !user.tenantId || !user.clientRoleId) return false;
  const roles = store.tenantRoles?.[user.tenantId] ?? [];
  const role = roles.find((item) => item.id === user.clientRoleId);
  return Boolean(role?.permissions?.employees);
}

function applySessionCookie(response: NextResponse, userId: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(userId),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json<AuthActionResponse>(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }
  const data = await loadAuthStore();
  return NextResponse.json(sanitizeStore(data));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as AuthApiActionRequest | null;
  if (!payload || typeof payload !== "object" || !("action" in payload)) {
    return NextResponse.json<AuthActionResponse>(
      { ok: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  const store = await loadAuthStore();
  const sessionUser = await getRequestUser(request);

  switch (payload.action) {
    case "register": {
      const email = payload.email.trim().toLowerCase();
      const exists = store.users.some((user) => user.email.toLowerCase() === email);
      if (exists) {
        return NextResponse.json<AuthActionResponse>({
          ok: false,
          message: "User with this email already exists",
        });
      }

      const nextUser = {
        id: `user-${crypto.randomUUID()}`,
        name: payload.name.trim(),
        email,
        password: payload.password,
        role: "User" as const,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
      const nextStore: AuthStoreData = {
        ...store,
        users: [...store.users, nextUser],
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: "Registration sent for admin approval",
        data: sanitizeStore(nextStore),
      });
    }
    case "login": {
      const email = payload.email.trim().toLowerCase();
      const user = store.users.find((item) => item.email.toLowerCase() === email);
      if (!user || user.password !== payload.password) {
        return NextResponse.json<AuthActionResponse>({
          ok: false,
          message: "Invalid email or password",
        });
      }
      if (user.status === "pending") {
        return NextResponse.json<AuthActionResponse>({
          ok: false,
          message: "Your account is pending approval by an admin",
        });
      }
      if (user.status === "rejected") {
        return NextResponse.json<AuthActionResponse>({
          ok: false,
          message: "Your account access was rejected by an admin",
        });
      }
      const response = NextResponse.json<AuthActionResponse>({
        ok: true,
        userId: user.id,
        data: sanitizeStore(store),
      });
      applySessionCookie(response, user.id);
      return response;
    }
    case "logout": {
      const response = NextResponse.json<AuthActionResponse>({ ok: true });
      clearSessionCookie(response);
      return response;
    }
    case "updateUserStatus": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) =>
          user.id === payload.userId ? { ...user, status: payload.status } : user,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "updateUserRole": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) =>
          user.id === payload.userId ? { ...user, role: payload.role } : user,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "toggleRolePageAccess": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        rolePermissions: {
          ...store.rolePermissions,
          [payload.role]: {
            ...store.rolePermissions[payload.role],
            [payload.page]: !store.rolePermissions[payload.role][payload.page],
          },
        },
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "toggleRoleAreaAccess": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        roleAreaAccess: {
          ...store.roleAreaAccess,
          [payload.role]: {
            ...store.roleAreaAccess[payload.role],
            [payload.area]: !store.roleAreaAccess[payload.role][payload.area],
          },
        },
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "toggleRoleDashboardBlockAccess": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        roleDashboardBlockAccess: {
          ...store.roleDashboardBlockAccess,
          [payload.role]: {
            ...store.roleDashboardBlockAccess[payload.role],
            [payload.block]: !store.roleDashboardBlockAccess[payload.role][payload.block],
          },
        },
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "setAllRoleAccess": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        rolePermissions: {
          ...store.rolePermissions,
          [payload.role]: {
            dashboard: payload.value,
            clients: payload.value,
            orders: payload.value,
            preOrders: payload.value,
            requestRides: payload.value,
            driversMap: payload.value,
            priceCalculator: payload.value,
            accesses: payload.value,
            notes: payload.value,
          },
        },
        roleDashboardBlockAccess: {
          ...store.roleDashboardBlockAccess,
          [payload.role]: {
            apiData: payload.value,
            yangoData: payload.value,
            tariffHealthCheck: payload.value,
          },
        },
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "deleteUser": {
      if (!sessionUser || sessionUser.role !== "Admin") {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.filter((user) => user.id !== payload.userId),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "upsertTenantAccount": {
      if (!isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const corpClientId = payload.corpClientId.trim();
      const tokenLabel = payload.tokenLabel.trim();
      const apiClientId = payload.apiClientId.trim();
      const primaryAdminEmail = payload.primaryAdminEmail.trim().toLowerCase();
      if (!corpClientId || !tokenLabel || !apiClientId || !primaryAdminEmail || !payload.primaryAdminPassword) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Missing required tenant onboarding fields." },
          { status: 400 },
        );
      }
      const tenantId = payload.tenantId?.trim() || `tenant-${crypto.randomUUID()}`;
      const tenantAccounts = [...(store.tenantAccounts ?? [])];
      const accountIndex = tenantAccounts.findIndex((item) => item.id === tenantId);
      const account = {
        id: tenantId,
        name: payload.name.trim() || payload.primaryAdminName.trim() || corpClientId,
        corpClientId,
        tokenLabel,
        apiClientId,
        enabled: true,
        createdAt: accountIndex >= 0 ? tenantAccounts[accountIndex].createdAt : new Date().toISOString(),
      };
      if (accountIndex >= 0) tenantAccounts[accountIndex] = account;
      else tenantAccounts.push(account);

      const tenantRoles = { ...(store.tenantRoles ?? {}) };
      if (!tenantRoles[tenantId] || tenantRoles[tenantId].length === 0) {
        tenantRoles[tenantId] = [
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
      const exists = store.users.find((user) => user.email.toLowerCase() === primaryAdminEmail);
      const users: AuthStoreData["users"] = exists
        ? store.users.map((user) =>
            user.id === exists.id
              ? {
                  ...user,
                  name: payload.primaryAdminName.trim() || user.name,
                  password: payload.primaryAdminPassword || user.password,
                  status: "approved",
                  accountType: "client",
                  tenantId,
                  corpClientId,
                  tokenLabel,
                  apiClientId,
                  clientRoleId: "client-admin",
                }
              : user,
          )
        : [
            ...store.users,
            {
              id: `user-${crypto.randomUUID()}`,
              name: payload.primaryAdminName.trim() || "Client Admin",
              email: primaryAdminEmail,
              password: payload.primaryAdminPassword,
              role: "User",
              status: "approved",
              createdAt: new Date().toISOString(),
              accountType: "client",
              tenantId,
              corpClientId,
              tokenLabel,
              apiClientId,
              clientRoleId: "client-admin",
            },
          ];
      const nextStore: AuthStoreData = { ...store, users, tenantAccounts, tenantRoles };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "upsertTenantRole": {
      if (!hasTenantEmployeesPermission(sessionUser, store) && !isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const tenantId = payload.tenantId.trim();
      const tenantRoles = { ...(store.tenantRoles ?? {}) };
      const roles = [...(tenantRoles[tenantId] ?? [])];
      const roleId = payload.roleId?.trim() || `role-${crypto.randomUUID()}`;
      const permissions: Record<ClientPortalPageKey, boolean> = {
        ...defaultClientPortalPermissions,
        ...(payload.permissions ?? {}),
      };
      const existingIdx = roles.findIndex((item) => item.id === roleId);
      const nextRole = {
        id: roleId,
        name: payload.name.trim() || "Role",
        permissions,
        isDefault: existingIdx >= 0 ? roles[existingIdx].isDefault : false,
      };
      if (existingIdx >= 0) roles[existingIdx] = nextRole;
      else roles.push(nextRole);
      tenantRoles[tenantId] = roles;
      const nextStore: AuthStoreData = { ...store, tenantRoles };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "createTenantEmployee": {
      if (!hasTenantEmployeesPermission(sessionUser, store) && !isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const email = payload.email.trim().toLowerCase();
      if (!email || !payload.password.trim()) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Email and password are required." },
          { status: 400 },
        );
      }
      if (store.users.some((user) => user.email.toLowerCase() === email)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "User with this email already exists." },
          { status: 400 },
        );
      }
      const tenant = (store.tenantAccounts ?? []).find((item) => item.id === payload.tenantId);
      if (!tenant) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Tenant not found." },
          { status: 404 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        users: [
          ...store.users,
          {
            id: `user-${crypto.randomUUID()}`,
            name: payload.name.trim() || "Employee",
            email,
            password: payload.password,
            role: "User",
            status: "approved",
            createdAt: new Date().toISOString(),
            accountType: "client",
            tenantId: tenant.id,
            corpClientId: tenant.corpClientId,
            tokenLabel: tenant.tokenLabel,
            apiClientId: tenant.apiClientId,
            clientRoleId: payload.clientRoleId,
          },
        ],
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "updateTenantEmployee": {
      if (!hasTenantEmployeesPermission(sessionUser, store) && !isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) =>
          user.id === payload.userId
            ? {
                ...user,
                ...(payload.name ? { name: payload.name.trim() } : {}),
                ...(payload.status ? { status: payload.status } : {}),
                ...(payload.clientRoleId ? { clientRoleId: payload.clientRoleId } : {}),
              }
            : user,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    default:
      return NextResponse.json<AuthActionResponse>(
        { ok: false, message: "Unknown action" },
        { status: 400 },
      );
  }
}
