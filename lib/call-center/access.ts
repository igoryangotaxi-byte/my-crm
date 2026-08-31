import { loadAuthStore } from "@/lib/auth-store";
import { requireApprovedUser } from "@/lib/server-auth";
import { getCallCenterUserSettings, type CallCenterUserSettings } from "@/lib/call-center/repository";

export async function requireCallCenterDialAccess(request: Request): Promise<
  | { ok: true; user: { id: string }; settings: CallCenterUserSettings }
  | { ok: false; response: Response }
> {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth;

  const store = await loadAuthStore();
  const permissions = store.rolePermissions[auth.user.role];
  const canDial =
    Boolean(permissions?.salesOperation) ||
    Boolean(permissions?.salesCallCenter) ||
    Boolean(permissions?.driversMap) ||
    Boolean(permissions?.preOrders) ||
    Boolean(permissions?.orders);
  if (!canDial) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

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
