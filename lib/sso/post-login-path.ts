import type { AppPageKey, AppRole, AuthStoreData, AuthUser } from "@/types/auth";
import {
  mergeAllRolePermissions,
  resolvePostLoginPath,
  CURRENT_PERMISSIONS_VERSION,
} from "@/lib/role-permissions";

/**
 * Server-side landing after Google SSO (or any cookie session bootstrap).
 * Uses the user's role permissions from the auth store — never hardcode /pipeline.
 */
export function resolvePostLoginPathForUser(
  store: AuthStoreData,
  user: Pick<AuthUser, "role" | "accountType" | "status">,
): string | null {
  if (user.status !== "approved") return null;
  const rolePermissions = mergeAllRolePermissions(
    store.rolePermissions,
    store.storeMeta?.permissionsVersion ?? CURRENT_PERMISSIONS_VERSION,
  );
  const role = user.role as AppRole;
  const pages = rolePermissions[role];
  const canAccess = (page: AppPageKey) => Boolean(pages?.[page]);
  return resolvePostLoginPath({
    accountType: user.accountType,
    canAccess,
  });
}
