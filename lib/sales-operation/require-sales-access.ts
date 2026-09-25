import type { AppPageKey, AuthStoreData, AuthUser } from "@/types/auth";
import { loadAuthStoreForRequest } from "@/lib/server-auth";
import {
  CURRENT_PERMISSIONS_VERSION,
  effectiveCanAccessPage,
  type SalesOperationPageKey,
} from "@/lib/role-permissions";

function isPageAllowed(
  store: AuthStoreData,
  user: AuthUser,
  pageKey: SalesOperationPageKey | "salesOperation",
): boolean {
  const version = store.storeMeta?.permissionsVersion ?? CURRENT_PERMISSIONS_VERSION;
  const shellAllowed = effectiveCanAccessPage(user, "salesOperation", store.rolePermissions, version);
  if (!shellAllowed) return false;
  if (pageKey === "salesOperation") return true;
  return effectiveCanAccessPage(user, pageKey as AppPageKey, store.rolePermissions, version);
}

/** My Space (tasks, calendar, personal items) — salesMySpace or legacy salesPipeline. */
export async function requireMySpacePage(request: Request) {
  return requireAnySalesOperationPage(request, ["salesMySpace", "salesPipeline"]);
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
