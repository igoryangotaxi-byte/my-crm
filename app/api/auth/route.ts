import { NextResponse } from "next/server";
import { loadAuthStore, saveAuthStore } from "@/lib/auth-store";
import {
  discoverYangoTenantDefaultCostCenterId,
  resolveDefaultCostCenterIdForYangoClient,
} from "@/lib/tenant-yango-bootstrap";
import { ensureRequestRideUserByPhone, listYangoClientUsers } from "@/lib/yango-api";
import { removeMappedUserId, upsertMappedUserId } from "@/lib/request-rides-user-map";
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

async function resolveTenantCostCenterId(
  tokenLabel: string,
  clientId: string,
  tenant?: { pinnedDefaultCostCenterId?: string | null },
) {
  return resolveDefaultCostCenterIdForYangoClient({
    tokenLabel,
    apiClientId: clientId,
    pinnedCostCenterId: tenant?.pinnedDefaultCostCenterId ?? null,
  });
}

function resolveTenantSharedCostCenterId(store: AuthStoreData, tenantId: string): string {
  const fromUsers = store.users.find(
    (user) =>
      user.accountType === "client" &&
      user.tenantId === tenantId &&
      typeof user.costCenterId === "string" &&
      user.costCenterId.trim().length > 0,
  );
  return fromUsers?.costCenterId?.trim() ?? "";
}

function sanitizeEmailLocalPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function syncTenantEmployeesFromYango(params: {
  store: AuthStoreData;
  tenant: {
    id: string;
    corpClientId: string;
    tokenLabel: string;
    apiClientId: string;
  };
}) {
  const { store, tenant } = params;
  const users = [...store.users];
  const existingEmails = new Set(users.map((user) => user.email.toLowerCase()));
  const existingPhones = new Set(
    users
      .filter(
        (user) =>
          user.accountType === "client" &&
          user.tenantId === tenant.id &&
          user.tokenLabel === tenant.tokenLabel &&
          user.apiClientId === tenant.apiClientId,
      )
      .map((user) => (user.phoneNumber ?? "").replace(/\D/g, ""))
      .filter(Boolean),
  );
  const remoteUsers = await listYangoClientUsers({
    tokenLabel: tenant.tokenLabel,
    clientId: tenant.apiClientId,
    limit: 1200,
  }).catch(() => []);
  let added = 0;
  let updated = 0;
  const phoneToCostCenter = new Map<string, string>();
  for (const remoteUser of remoteUsers) {
    const phoneDigits = (remoteUser.phone ?? "").replace(/\D/g, "");
    const cc = (remoteUser.costCenterId ?? "").trim();
    if (phoneDigits && cc) {
      phoneToCostCenter.set(phoneDigits, cc);
    }
  }
  for (const remoteUser of remoteUsers) {
    const phoneRaw = (remoteUser.phone ?? "").trim();
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (!phoneDigits || existingPhones.has(phoneDigits)) continue;
    const safeUserPart = sanitizeEmailLocalPart(remoteUser.userId || `legacy-${phoneDigits.slice(-6)}`);
    const safeTenantPart = sanitizeEmailLocalPart(tenant.id);
    let candidateEmail = `${safeTenantPart}.${safeUserPart}@client.local`;
    let suffix = 1;
    while (existingEmails.has(candidateEmail.toLowerCase())) {
      candidateEmail = `${safeTenantPart}.${safeUserPart}.${suffix}@client.local`;
      suffix += 1;
    }
    existingEmails.add(candidateEmail.toLowerCase());
    existingPhones.add(phoneDigits);
    users.push({
      id: `user-${crypto.randomUUID()}`,
      name: (remoteUser.fullName ?? "").trim() || phoneRaw || "Employee",
      email: candidateEmail,
      phoneNumber: phoneRaw || null,
      costCenterId: (remoteUser.costCenterId ?? "").trim() || null,
      password: `auto-${crypto.randomUUID()}`,
      role: "User",
      status: "approved",
      createdAt: new Date().toISOString(),
      accountType: "client",
      tenantId: tenant.id,
      corpClientId: tenant.corpClientId,
      tokenLabel: tenant.tokenLabel,
      apiClientId: tenant.apiClientId,
      clientRoleId: "employee",
    });
    if (phoneRaw && remoteUser.userId) {
      upsertMappedUserId({
        tokenLabel: tenant.tokenLabel,
        clientId: tenant.apiClientId,
        phoneNumber: phoneRaw,
        userId: remoteUser.userId,
      });
    }
    added += 1;
  }
  for (let i = 0; i < users.length; i += 1) {
    const user = users[i];
    if (
      user.accountType !== "client" ||
      user.tenantId !== tenant.id ||
      user.tokenLabel !== tenant.tokenLabel ||
      user.apiClientId !== tenant.apiClientId
    ) {
      continue;
    }
    if ((user.costCenterId ?? "").trim()) continue;
    const digits = (user.phoneNumber ?? "").replace(/\D/g, "");
    const cc = phoneToCostCenter.get(digits) ?? "";
    if (!cc) continue;
    users[i] = { ...user, costCenterId: cc };
    updated += 1;
  }
  const tenantDefaultCostCenterId = await discoverYangoTenantDefaultCostCenterId({
    tokenLabel: tenant.tokenLabel,
    apiClientId: tenant.apiClientId,
    yangoUsers: remoteUsers,
  });
  if (tenantDefaultCostCenterId) {
    for (let i = 0; i < users.length; i += 1) {
      const user = users[i];
      if (
        user.accountType !== "client" ||
        user.tenantId !== tenant.id ||
        user.tokenLabel !== tenant.tokenLabel ||
        user.apiClientId !== tenant.apiClientId
      ) {
        continue;
      }
      if ((user.costCenterId ?? "").trim()) continue;
      users[i] = { ...user, costCenterId: tenantDefaultCostCenterId };
      updated += 1;
    }
  }
  return { users, added, updated, tenantDefaultCostCenterId };
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
            communications: payload.value,
            financialCenter: payload.value,
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
    // Programmatic tenant bootstrap (API/scripts). Primary onboarding UX is Notes → "Add client by API token".
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
      const prev = accountIndex >= 0 ? tenantAccounts[accountIndex] : null;
      const account = {
        ...(prev ?? {}),
        id: tenantId,
        name: payload.name.trim() || payload.primaryAdminName.trim() || corpClientId,
        corpClientId,
        tokenLabel,
        apiClientId,
        defaultCostCenterId: prev?.defaultCostCenterId ?? null,
        enabled: true,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
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
      const synced = await syncTenantEmployeesFromYango({
        store: { ...store, users, tenantAccounts, tenantRoles },
        tenant: {
          id: tenantId,
          corpClientId,
          tokenLabel,
          apiClientId,
        },
      });
      const nextStore: AuthStoreData = {
        ...store,
        users: synced.users,
        tenantAccounts: tenantAccounts.map((item) =>
          item.id === tenantId && synced.tenantDefaultCostCenterId
            ? { ...item, defaultCostCenterId: synced.tenantDefaultCostCenterId }
            : item,
        ),
        tenantRoles,
      };
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
    case "updateTenantB2CSettings": {
      if (!isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const tenantId = payload.tenantId.trim();
      const token = (payload.b2cToken ?? "").trim();
      const createEndpoint = (payload.b2cCreateEndpoint ?? "").trim();
      const rideClass = (payload.b2cRideClass ?? "").trim() || "comfortplus";
      const nextAccounts = (store.tenantAccounts ?? []).map((tenant) =>
        tenant.id === tenantId
          ? {
              ...tenant,
              b2cEnabled: payload.b2cEnabled && Boolean(token),
              b2cToken: token || null,
              b2cClientId: (payload.b2cClientId ?? "").trim() || null,
              b2cRideClass: rideClass,
              b2cCreateEndpoint: createEndpoint || null,
            }
          : tenant,
      );
      const nextStore: AuthStoreData = {
        ...store,
        tenantAccounts: nextAccounts,
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: "B2C fallback settings saved.",
        data: sanitizeStore(nextStore),
      });
    }
    case "updateGlobalB2CSettings": {
      if (!isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const token = (payload.token ?? "").trim();
      const nextStore: AuthStoreData = {
        ...store,
        globalB2CSettings: {
          enabled: payload.enabled && Boolean(token),
          token: token || null,
          clientId: (payload.clientId ?? "").trim() || null,
          rideClass: (payload.rideClass ?? "").trim() || "comfortplus",
          createEndpoint: (payload.createEndpoint ?? "").trim() || null,
        },
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: "Global B2C fallback settings saved.",
        data: sanitizeStore(nextStore),
      });
    }
    case "updateTenantPortalSections": {
      if (!isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const tenantId = payload.tenantId.trim();
      const nextAccounts = (store.tenantAccounts ?? []).map((tenant) =>
        tenant.id === tenantId
          ? {
              ...tenant,
              clientPortalCommunicationsEnabled: payload.clientPortalCommunicationsEnabled,
              clientPortalFinancialCenterEnabled: payload.clientPortalFinancialCenterEnabled,
            }
          : tenant,
      );
      const nextStore: AuthStoreData = {
        ...store,
        tenantAccounts: nextAccounts,
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: "Client portal sections updated.",
        data: sanitizeStore(nextStore),
      });
    }
    case "createTenantEmployee": {
      if (!hasTenantEmployeesPermission(sessionUser, store) && !isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const email = payload.email.trim().toLowerCase();
      const phoneNumber = (payload.phoneNumber ?? "").trim();
      if (!email || !payload.password.trim()) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Email and password are required." },
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
      const existingByEmail = store.users.find((user) => user.email.toLowerCase() === email);
      if (
        existingByEmail &&
        !(
          existingByEmail.accountType === "client" &&
          existingByEmail.tenantId === tenant.id &&
          existingByEmail.tokenLabel === tenant.tokenLabel &&
          existingByEmail.apiClientId === tenant.apiClientId
        )
      ) {
        return NextResponse.json<AuthActionResponse>(
          {
            ok: false,
            message:
              "User with this email already exists in another account. Use a different email for this cabinet.",
          },
          { status: 400 },
        );
      }
      const phoneDigits = phoneNumber.replace(/\D/g, "");
      let workingStore = store;
      if (phoneDigits) {
        const duplicatePhone = workingStore.users.find(
          (user) =>
            user.accountType === "client" &&
            user.tenantId === tenant.id &&
            (user.phoneNumber ?? "").replace(/\D/g, "") === phoneDigits,
        );
        if (duplicatePhone) {
          return NextResponse.json<AuthActionResponse>(
            { ok: false, message: "Employee with this phone already exists in this cabinet." },
            { status: 400 },
          );
        }
      }
      const costCenterId =
        (payload.costCenterId ?? "").trim() ||
        (tenant.defaultCostCenterId ?? "").trim() ||
        resolveTenantSharedCostCenterId(store, tenant.id) ||
        (await resolveTenantCostCenterId(tenant.tokenLabel, tenant.apiClientId, tenant));
      if (!(costCenterId ?? "").trim()) {
        return NextResponse.json<AuthActionResponse>(
          {
            ok: false,
            message:
              "No cost center is configured for this cabinet. Ensure cost centers exist in Yango for this park client, sync employees from Access, or set a default cost center on the tenant.",
          },
          { status: 400 },
        );
      }
      if (phoneNumber) {
        let ensure = await ensureRequestRideUserByPhone({
          tokenLabel: tenant.tokenLabel,
          clientId: tenant.apiClientId,
          phoneNumber,
          fullName: payload.name,
          costCenterId,
        });
        if (!ensure.ok) {
          // Try to refresh local user map from Yango once, then retry create/resolve.
          const synced = await syncTenantEmployeesFromYango({
            store: workingStore,
            tenant: {
              id: tenant.id,
              corpClientId: tenant.corpClientId,
              tokenLabel: tenant.tokenLabel,
              apiClientId: tenant.apiClientId,
            },
          });
          workingStore = {
            ...workingStore,
            users: synced.users,
            tenantAccounts: (workingStore.tenantAccounts ?? []).map((item) =>
              item.id === tenant.id && synced.tenantDefaultCostCenterId
                ? { ...item, defaultCostCenterId: synced.tenantDefaultCostCenterId }
                : item,
            ),
          };
          await saveAuthStore(workingStore);
          ensure = await ensureRequestRideUserByPhone({
            tokenLabel: tenant.tokenLabel,
            clientId: tenant.apiClientId,
            phoneNumber,
            fullName: payload.name,
            costCenterId,
          });
        }
        if (!ensure.ok) {
          return NextResponse.json<AuthActionResponse>(
            {
              ok: false,
              message:
                ensure.error ??
                "Failed to create employee in Yango. Employee was not added to the cabinet.",
            },
            { status: 502 },
          );
        }
      }
      const nextUsers: AuthStoreData["users"] = existingByEmail
        ? workingStore.users.map((user) =>
            user.id === existingByEmail.id
              ? {
                  ...user,
                  name: payload.name.trim() || user.name || "Employee",
                  phoneNumber: phoneNumber || null,
                  costCenterId: costCenterId || null,
                  password: payload.password,
                  status: "approved" as const,
                  accountType: "client" as const,
                  tenantId: tenant.id,
                  corpClientId: tenant.corpClientId,
                  tokenLabel: tenant.tokenLabel,
                  apiClientId: tenant.apiClientId,
                  clientRoleId: payload.clientRoleId,
                }
              : user,
          )
        : [
            ...workingStore.users,
            {
              id: `user-${crypto.randomUUID()}`,
              name: payload.name.trim() || "Employee",
              email,
              phoneNumber: phoneNumber || null,
              costCenterId: costCenterId || null,
              password: payload.password,
              role: "User" as const,
              status: "approved" as const,
              createdAt: new Date().toISOString(),
              accountType: "client" as const,
              tenantId: tenant.id,
              corpClientId: tenant.corpClientId,
              tokenLabel: tenant.tokenLabel,
              apiClientId: tenant.apiClientId,
              clientRoleId: payload.clientRoleId,
            },
          ];
      let nextStore: AuthStoreData = {
        ...workingStore,
        users: nextUsers,
      };
      if (costCenterId && (tenant.defaultCostCenterId ?? "").trim() !== costCenterId) {
        nextStore = {
          ...nextStore,
          tenantAccounts: (nextStore.tenantAccounts ?? []).map((item) =>
            item.id === tenant.id ? { ...item, defaultCostCenterId: costCenterId } : item,
          ),
        };
      }
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: existingByEmail ? "Employee updated in this cabinet." : "Employee created.",
        data: sanitizeStore(nextStore),
      });
    }
    case "updateTenantEmployee": {
      if (!hasTenantEmployeesPermission(sessionUser, store) && !isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const previous = store.users.find((user) => user.id === payload.userId) ?? null;
      const previewUpdated = store.users.find((user) => user.id === payload.userId);
      if (!previewUpdated) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "User not found." },
          { status: 404 },
        );
      }
      if (typeof payload.phoneNumber === "string") {
        const updated = {
          ...previewUpdated,
          ...(payload.name ? { name: payload.name.trim() } : {}),
          phoneNumber: payload.phoneNumber.trim() || null,
          ...(typeof payload.costCenterId === "string"
            ? { costCenterId: payload.costCenterId.trim() || null }
            : {}),
        };
        const prevPhone = previous?.phoneNumber?.trim() ?? "";
        const nextPhone = payload.phoneNumber.trim();
        if (
          previous?.accountType === "client" &&
          previous.tokenLabel &&
          previous.apiClientId &&
          prevPhone &&
          prevPhone !== nextPhone
        ) {
          removeMappedUserId({
            tokenLabel: previous.tokenLabel,
            clientId: previous.apiClientId,
            phoneNumber: prevPhone,
          });
        }
        if (updated?.accountType === "client" && updated.tokenLabel && updated.apiClientId) {
          const phoneNumber = nextPhone;
          const tenantRow =
            updated.tenantId != null
              ? (store.tenantAccounts ?? []).find((item) => item.id === updated.tenantId)
              : undefined;
          const costCenterId =
            (typeof payload.costCenterId === "string" ? payload.costCenterId : "").trim() ||
            (updated.costCenterId ?? "").trim() ||
            tenantRow?.defaultCostCenterId?.trim() ||
            (updated.tenantId ? resolveTenantSharedCostCenterId(store, updated.tenantId) : "") ||
            (await resolveTenantCostCenterId(updated.tokenLabel, updated.apiClientId, tenantRow));
          if (phoneNumber && !(costCenterId ?? "").trim()) {
            return NextResponse.json<AuthActionResponse>(
              {
                ok: false,
                message:
                  "No cost center is configured for this cabinet. Sync employees from Access or set a cost center before assigning a phone.",
              },
              { status: 400 },
            );
          }
          if (phoneNumber) {
            const ensure = await ensureRequestRideUserByPhone({
              tokenLabel: updated.tokenLabel,
              clientId: updated.apiClientId,
              phoneNumber,
              fullName: payload.name ?? updated.name,
              costCenterId,
            });
            if (!ensure.ok) {
              return NextResponse.json<AuthActionResponse>(
                {
                  ok: false,
                  message:
                    ensure.error ??
                    "Failed to update employee in Yango. Phone update was not applied.",
                },
                { status: 502 },
              );
            }
          }
        }
      }
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) =>
          user.id === payload.userId
            ? {
                ...user,
                ...(payload.name ? { name: payload.name.trim() } : {}),
                ...(typeof payload.phoneNumber === "string"
                  ? { phoneNumber: payload.phoneNumber.trim() || null }
                  : {}),
                ...(typeof payload.costCenterId === "string"
                  ? { costCenterId: payload.costCenterId.trim() || null }
                  : {}),
                ...(payload.status ? { status: payload.status } : {}),
                ...(payload.clientRoleId ? { clientRoleId: payload.clientRoleId } : {}),
              }
            : user,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: sanitizeStore(nextStore) });
    }
    case "deleteTenantAccount": {
      if (!isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const tenantId = (payload.tenantId ?? "").trim();
      if (!tenantId) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Missing tenant id." },
          { status: 400 },
        );
      }
      const accounts = store.tenantAccounts ?? [];
      if (!accounts.some((item) => item.id === tenantId)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Cabinet not found." },
          { status: 404 },
        );
      }
      const tenantRoles = { ...(store.tenantRoles ?? {}) };
      delete tenantRoles[tenantId];
      const nextStore: AuthStoreData = {
        ...store,
        tenantAccounts: accounts.filter((item) => item.id !== tenantId),
        tenantRoles,
        users: store.users.filter(
          (user) => !(user.accountType === "client" && user.tenantId === tenantId),
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: "Client cabinet removed.",
        data: sanitizeStore(nextStore),
      });
    }
    case "syncTenantEmployees": {
      if (!isInternalAdmin(sessionUser)) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Forbidden" },
          { status: 403 },
        );
      }
      const tenant = (store.tenantAccounts ?? []).find((item) => item.id === payload.tenantId);
      if (!tenant) {
        return NextResponse.json<AuthActionResponse>(
          { ok: false, message: "Tenant not found." },
          { status: 404 },
        );
      }
      const synced = await syncTenantEmployeesFromYango({
        store,
        tenant: {
          id: tenant.id,
          corpClientId: tenant.corpClientId,
          tokenLabel: tenant.tokenLabel,
          apiClientId: tenant.apiClientId,
        },
      });
      const nextStore: AuthStoreData = {
        ...store,
        users: synced.users,
        tenantAccounts: (store.tenantAccounts ?? []).map((item) =>
          item.id === tenant.id && synced.tenantDefaultCostCenterId
            ? { ...item, defaultCostCenterId: synced.tenantDefaultCostCenterId }
            : item,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        message: `Synced ${synced.added} new and ${synced.updated} existing employee(s) from Yango.`,
        data: sanitizeStore(nextStore),
      });
    }
    default:
      return NextResponse.json<AuthActionResponse>(
        { ok: false, message: "Unknown action" },
        { status: 400 },
      );
  }
}
