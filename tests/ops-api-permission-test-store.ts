import {
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type AppPageKey,
  type AppRole,
  type AuthStoreData,
} from "@/types/auth";

/** In-memory auth store for ops API permission unit tests (no Supabase/KV). */
export function makeOpsApiPermissionTestStore(
  rolePageOverrides?: Partial<Record<AppRole, Partial<Record<AppPageKey, boolean>>>>,
): AuthStoreData {
  const rolePermissions = structuredClone(defaultRolePermissions);
  if (rolePageOverrides) {
    for (const [role, pages] of Object.entries(rolePageOverrides) as [
      AppRole,
      Partial<Record<AppPageKey, boolean>>,
    ][]) {
      rolePermissions[role] = { ...rolePermissions[role], ...pages };
    }
  }
  return {
    users: [],
    rolePermissions,
    roleAreaAccess: defaultRoleAreaAccess,
    roleDashboardBlockAccess: defaultRoleDashboardBlockAccess,
  };
}
