import type { AppPageKey } from "@/types/auth";
import { loadAuthStore } from "@/lib/auth-store";
import { requireApprovedUser } from "@/lib/server-auth";

export async function requireRouteBundlesAccess(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth;

  const store = await loadAuthStore();
  const permissions = store.rolePermissions[auth.user.role];
  if (!permissions?.salesOperation || !permissions.preOrders) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }
  return { ok: true as const, user: auth.user, permissions };
}

export async function requireRouteBundlesSettingsWrite(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth;
  const canWrite =
    auth.user.role === "Admin" || Boolean(auth.permissions.salesSettings as boolean | undefined);
  if (!canWrite) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }
  return auth;
}

export function hasPage(permissions: Partial<Record<AppPageKey, boolean>> | undefined, page: AppPageKey) {
  return Boolean(permissions?.[page]);
}
