import { requireApprovedUser } from "@/lib/server-auth";
import { loadAuthStore } from "@/lib/auth-store";
import { isTelephonyEnabled } from "@/lib/telephony/env";

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

  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth;

  const store = await loadAuthStore();
  const permissions = store.rolePermissions[auth.user.role];
  const allowed =
    Boolean(permissions?.salesAstradial) ||
    Boolean(permissions?.salesCallCenter) ||
    Boolean(permissions?.salesOperation) ||
    Boolean(permissions?.driversMap) ||
    Boolean(permissions?.preOrders) ||
    Boolean(permissions?.orders);

  if (!allowed) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true, user: { id: auth.user.id, role: auth.user.role } };
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

  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth;

  const store = await loadAuthStore();
  const permissions = store.rolePermissions[auth.user.role];
  const pageOk =
    Boolean(permissions?.salesOperation) &&
    (Boolean(permissions?.salesAstradial) || Boolean(permissions?.salesCallCenter));
  if (!pageOk) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true, user: { id: auth.user.id, role: auth.user.role } };
}
