import type { AppPageKey, AuthStoreData, AuthUser } from "@/types/auth";
import {
  CURRENT_PERMISSIONS_VERSION,
  effectiveCanAccessPage,
  resolvePostLoginPath,
} from "@/lib/role-permissions";

/**
 * Server-side landing after Google SSO (or any cookie session bootstrap).
 * Uses effective page access (role + per-user overrides) — never hardcode /pipeline.
 */
export function resolvePostLoginPathForUser(
  store: AuthStoreData,
  user: Pick<AuthUser, "role" | "accountType" | "status" | "pageOverrides">,
): string | null {
  if (user.status !== "approved") return null;
  const version = store.storeMeta?.permissionsVersion ?? CURRENT_PERMISSIONS_VERSION;
  const canAccess = (page: AppPageKey) =>
    effectiveCanAccessPage(user, page, store.rolePermissions, version);
  return resolvePostLoginPath({
    accountType: user.accountType,
    canAccess,
  });
}
