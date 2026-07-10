import type { AppPageKey } from "@/types/auth";
import { loadAuthStore } from "@/lib/auth-store";
import { requireApprovedUser } from "@/lib/server-auth";
import type { SalesOperationPageKey } from "@/lib/role-permissions";

export async function requireSalesOperationPage(
  request: Request,
  pageKey: SalesOperationPageKey | "salesOperation" = "salesOperation",
) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) {
    return auth;
  }

  const store = await loadAuthStore();
  const permissions = store.rolePermissions[auth.user.role];
  if (!permissions) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  const shellAllowed = permissions.salesOperation;
  const pageAllowed =
    pageKey === "salesOperation" ? shellAllowed : permissions[pageKey as AppPageKey];

  if (!shellAllowed || !pageAllowed) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true as const, user: auth.user };
}
