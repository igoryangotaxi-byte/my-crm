import type { AppRole, AuthStoreData } from "@/types/auth";
import { loadAuthStoreForRequest } from "@/lib/server-auth";
import { isTelephonyEnabled } from "@/lib/telephony/env";

function isTelephonyRoleAllowed(
  permissions: AuthStoreData["rolePermissions"][AppRole] | undefined,
): boolean {
  if (!permissions) return false;
  return (
    Boolean(permissions.salesAstradial) ||
    Boolean(permissions.salesCallCenter) ||
    Boolean(permissions.salesOperation) ||
    Boolean(permissions.driversMap) ||
    Boolean(permissions.preOrders) ||
    Boolean(permissions.orders)
  );
}

export async function requireTelephonyAccess(request: Request): Promise<
  | { ok: true; user: { id: string; role: string } }
  | { ok: false; response: Response }
> {
  if (!isTelephonyEnabled()) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, code: "telephony_disabled", error: "Telephony is disabled." },
        { status: 503 },
      ),
    };
  }

  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) return session;

  if (!isTelephonyRoleAllowed(session.store.rolePermissions[session.user.role])) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true, user: { id: session.user.id, role: session.user.role } };
}

export async function requireTelephonyPage(request: Request): Promise<
  | { ok: true; user: { id: string; role: string } }
  | { ok: false; response: Response }
> {
  if (!isTelephonyEnabled()) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, code: "telephony_disabled", error: "Telephony is disabled." },
        { status: 503 },
      ),
    };
  }

  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) return session;

  const permissions = session.store.rolePermissions[session.user.role];
  const pageOk =
    Boolean(permissions?.salesOperation) &&
    (Boolean(permissions?.salesAstradial) || Boolean(permissions?.salesCallCenter));
  if (!pageOk) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true, user: { id: session.user.id, role: session.user.role } };
}
