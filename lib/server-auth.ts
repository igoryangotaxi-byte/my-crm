import { loadAuthStore } from "@/lib/auth-store";
import { runWithAuthKvRequestContextAsync } from "@/lib/auth-kv-request-context";
import { isPermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";
import { getSessionUserIdFromRequest } from "@/lib/server-session";
import type { AuthStoreData, AuthUser, ClientRoleDefinition } from "@/types/auth";

/** Resolve the signed-in user from an already-loaded auth store (avoids a second load). */
export function resolveSessionUserFromStore(
  request: Request,
  store: AuthStoreData,
): AuthUser | null {
  const sessionUserId = getSessionUserIdFromRequest(request);
  if (!sessionUserId) return null;
  const user = store.users.find((item) => item.id === sessionUserId) ?? null;
  if (!user || user.status !== "approved") return null;
  return user;
}

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  const store = await loadAuthStore();
  return resolveSessionUserFromStore(request, store);
}

/** One `loadAuthStore()` per request; resolves session user from the same snapshot. */
export async function loadAuthStoreForRequest(request: Request): Promise<
  | { ok: true; store: AuthStoreData; user: AuthUser }
  | { ok: false; response: Response }
> {
  return runWithAuthKvRequestContextAsync(async () => {
    let store: AuthStoreData;
    try {
      store = await loadAuthStore();
    } catch (error) {
      if (isPermissionStoreUnavailableError(error)) {
        const { permissionStoreUnavailableResponse } = await import(
          "@/lib/permission-store-unavailable"
        );
        return { ok: false, response: permissionStoreUnavailableResponse() };
      }
      const message =
        error instanceof Error
          ? `Supabase auth/profile store is unavailable: ${error.message}`
          : "Supabase auth/profile store is unavailable.";
      return {
        ok: false,
        response: Response.json({ ok: false, error: message }, {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }),
      };
    }

    const user = resolveSessionUserFromStore(request, store);
    if (!user) {
      return {
        ok: false,
        response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      };
    }
    return { ok: true, store, user };
  });
}

export async function requireApprovedUser(request: Request) {
  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) {
    return session;
  }
  return { ok: true as const, user: session.user };
}

export async function requireAdminUser(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "Admin") {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, user };
}

export function getClientScope(user: AuthUser | null) {
  if (!user || user.accountType !== "client") return null;
  if (!user.tenantId || !user.corpClientId || !user.tokenLabel || !user.apiClientId) return null;
  return {
    tenantId: user.tenantId,
    corpClientId: user.corpClientId,
    tokenLabel: user.tokenLabel,
    apiClientId: user.apiClientId,
    clientRoleId: user.clientRoleId ?? null,
  };
}

export async function requireClientScopedUser(request: Request) {
  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) {
    return session;
  }
  const { user, store } = session;
  const scope = getClientScope(user);
  if (!scope) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Client scope is not configured." }, { status: 403 }),
    };
  }
  const rolesForTenant = store.tenantRoles?.[scope.tenantId] ?? [];
  if (rolesForTenant.length === 0) {
    return {
      ok: false as const,
      response: Response.json(
        { ok: false, code: "PERMISSION_DENIED", error: "Forbidden." },
        { status: 403 },
      ),
    };
  }
  const role: ClientRoleDefinition | undefined = scope.clientRoleId
    ? rolesForTenant.find((item) => item.id === scope.clientRoleId)
    : undefined;
  if (!role) {
    return {
      ok: false as const,
      response: Response.json(
        { ok: false, code: "PERMISSION_DENIED", error: "Forbidden." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, user, scope, clientRole: role };
}
