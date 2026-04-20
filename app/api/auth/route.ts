import { NextResponse } from "next/server";
import { loadAuthStore, saveAuthStore } from "@/lib/auth-store";
import type { AuthApiActionRequest, AuthStoreData } from "@/types/auth";

type AuthActionResponse = {
  ok: boolean;
  message?: string;
  userId?: string;
  data?: AuthStoreData;
};

export async function GET() {
  const data = await loadAuthStore();
  return NextResponse.json(data);
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
        data: nextStore,
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
      return NextResponse.json<AuthActionResponse>({
        ok: true,
        userId: user.id,
        data: store,
      });
    }
    case "updateUserStatus": {
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) =>
          user.id === payload.userId ? { ...user, status: payload.status } : user,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: nextStore });
    }
    case "updateUserRole": {
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) =>
          user.id === payload.userId ? { ...user, role: payload.role } : user,
        ),
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: nextStore });
    }
    case "toggleRolePageAccess": {
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
      return NextResponse.json<AuthActionResponse>({ ok: true, data: nextStore });
    }
    case "toggleRoleAreaAccess": {
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
      return NextResponse.json<AuthActionResponse>({ ok: true, data: nextStore });
    }
    case "setAllRoleAccess": {
      const nextStore: AuthStoreData = {
        ...store,
        rolePermissions: {
          ...store.rolePermissions,
          [payload.role]: {
            dashboard: payload.value,
            clients: payload.value,
            orders: payload.value,
            preOrders: payload.value,
            priceCalculator: payload.value,
            accesses: payload.value,
            notes: payload.value,
          },
        },
      };
      await saveAuthStore(nextStore);
      return NextResponse.json<AuthActionResponse>({ ok: true, data: nextStore });
    }
    default:
      return NextResponse.json<AuthActionResponse>(
        { ok: false, message: "Unknown action" },
        { status: 400 },
      );
  }
}
