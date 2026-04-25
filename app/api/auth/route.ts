import { NextResponse } from "next/server";
import { loadAuthStore, saveAuthStore } from "@/lib/auth-store";
import { getRequestUser } from "@/lib/server-auth";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/server-session";
import type { AuthApiActionRequest, AuthStoreData } from "@/types/auth";

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
    default:
      return NextResponse.json<AuthActionResponse>(
        { ok: false, message: "Unknown action" },
        { status: 400 },
      );
  }
}
