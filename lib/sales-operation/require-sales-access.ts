import type { AppPageKey, AuthStoreData, AuthUser } from "@/types/auth";
import { loadAuthStoreForRequest } from "@/lib/server-auth";
import type { SalesOperationPageKey } from "@/lib/role-permissions";

function isPageAllowed(
  store: AuthStoreData,
  user: AuthUser,
  pageKey: SalesOperationPageKey | "salesOperation",
): boolean {
  const permissions = store.rolePermissions[user.role];
  if (!permissions) {
    return false;
  }
  const shellAllowed = permissions.salesOperation;
  const pageAllowed =
    pageKey === "salesOperation" ? shellAllowed : permissions[pageKey as AppPageKey];
  return Boolean(shellAllowed && pageAllowed);
}

export async function requireSalesOperationPage(
  request: Request,
  pageKey: SalesOperationPageKey | "salesOperation" = "salesOperation",
) {
  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) {
    return session;
  }

  if (!isPageAllowed(session.store, session.user, pageKey)) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true as const, user: session.user };
}

export async function requireAnySalesOperationPage(
  request: Request,
  pageKeys: Array<SalesOperationPageKey | "salesOperation">,
) {
  const keys = pageKeys.length > 0 ? pageKeys : (["salesOperation"] as const);
  const session = await loadAuthStoreForRequest(request);
  if (!session.ok) {
    return session;
  }

  for (const pageKey of keys) {
    if (isPageAllowed(session.store, session.user, pageKey)) {
      return { ok: true as const, user: session.user };
    }
  }

  return {
    ok: false as const,
    response: Response.json({ ok: false, error: "Forbidden." }, { status: 403 }),
  };
}
