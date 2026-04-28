import { loadAuthStore } from "@/lib/auth-store";
import { getSessionUserIdFromRequest } from "@/lib/server-session";
import type { AuthUser, ClientRoleDefinition } from "@/types/auth";

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  const sessionUserId = getSessionUserIdFromRequest(request);
  if (!sessionUserId) return null;
  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === sessionUserId) ?? null;
  if (!user || user.status !== "approved") return null;
  return user;
}

export async function requireApprovedUser(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, user };
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
  const user = await getRequestUser(request);
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  const scope = getClientScope(user);
  if (!scope) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Client scope is not configured." }, { status: 403 }),
    };
  }
  const store = await loadAuthStore();
  const role: ClientRoleDefinition | undefined = store.tenantRoles?.[scope.tenantId]?.find(
    (item) => item.id === scope.clientRoleId,
  );
  return { ok: true as const, user, scope, clientRole: role ?? null };
}
