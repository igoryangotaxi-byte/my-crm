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

export async function requireAnySalesOperationPage(
  request: Request,
  pageKeys: Array<SalesOperationPageKey | "salesOperation">,
) {
  if (pageKeys.length === 0) {
    return requireSalesOperationPage(request, "salesOperation");
  }
  const first = await requireSalesOperationPage(request, pageKeys[0]);
  if (first.ok) return first;
  if (first.response.status === 401) return first;
  for (const pageKey of pageKeys.slice(1)) {
    const next = await requireSalesOperationPage(request, pageKey);
    if (next.ok) return next;
  }
  return first;
}
