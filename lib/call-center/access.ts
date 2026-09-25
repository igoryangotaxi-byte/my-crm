import { loadAuthStoreForRequest } from "@/lib/server-auth";
import { getCallCenterUserSettings, type CallCenterUserSettings } from "@/lib/call-center/repository";

export async function requireCallCenterOperatorAccess(request: Request): Promise<
  | { ok: true; user: { id: string } }
  | { ok: false; response: Response }
> {
  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) return session;

  const permissions = session.store.rolePermissions[session.user.role];
  const allowed =
    Boolean(permissions?.salesOperation) ||
    Boolean(permissions?.salesCallCenter) ||
    Boolean(permissions?.driversMap) ||
    Boolean(permissions?.preOrders) ||
    Boolean(permissions?.orders);
  if (!allowed) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }
  return { ok: true, user: session.user };
}

export async function requireCallCenterDialAccess(request: Request): Promise<
  | { ok: true; user: { id: string }; settings: CallCenterUserSettings }
  | { ok: false; response: Response }
> {
  const auth = await requireCallCenterOperatorAccess(request);
  if (!auth.ok) return auth;

  const settings = await getCallCenterUserSettings(auth.user.id);
  if (!settings?.extension) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          code: "not_linked",
          error: "Link your 3CX extension in Call Center first.",
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, user: auth.user, settings };
}
