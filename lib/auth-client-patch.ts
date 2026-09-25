import type { AppPageKey, AppRole, AuthUser, RolePermissions } from "@/types/auth";

export type AuthClientPatch = {
  updatedUser?: AuthUser;
  updatedRolePermissions?: {
    role: AppRole;
    permissions: Record<AppPageKey, boolean>;
  };
};

export function applyAuthClientPatch(input: {
  users: AuthUser[];
  rolePermissions: RolePermissions;
  patch: AuthClientPatch;
}): { users: AuthUser[]; rolePermissions: RolePermissions } {
  let { users, rolePermissions } = input;
  const { patch } = input;

  if (patch.updatedUser) {
    const updated = { ...patch.updatedUser, password: "" };
    users = users.map((user) => (user.id === updated.id ? updated : user));
  }

  if (patch.updatedRolePermissions) {
    rolePermissions = {
      ...rolePermissions,
      [patch.updatedRolePermissions.role]: {
        ...rolePermissions[patch.updatedRolePermissions.role],
        ...patch.updatedRolePermissions.permissions,
      },
    };
  }

  return { users, rolePermissions };
}
