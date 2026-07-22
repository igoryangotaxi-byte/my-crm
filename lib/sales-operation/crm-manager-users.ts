import type { AppRole, AuthUser } from "@/types/auth";

export type CrmManagerUserOption = {
  id: string;
  name: string;
  role: AppRole;
};

/** Approved internal users with platform access (excludes pending/rejected and client-portal accounts). */
export function isInternalCrmUser(user: AuthUser): boolean {
  return user.status === "approved" && (user.accountType ?? "internal") !== "client";
}

/** All platform staff — for assignees, owners, filters, and general employee pickers. */
export function getPlatformStaffUserOptions(users: AuthUser[]): CrmManagerUserOption[] {
  return users
    .filter(isInternalCrmUser)
    .map((user) => ({ id: user.id, name: user.name, role: user.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAccountManagerUserOptions(users: AuthUser[]): CrmManagerUserOption[] {
  return users
    .filter(isInternalCrmUser)
    .filter((user) => user.role === "Account Manager" || user.role === "Admin")
    .map((user) => ({ id: user.id, name: user.name, role: user.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSalesManagerUserOptions(users: AuthUser[]): CrmManagerUserOption[] {
  return users
    .filter(isInternalCrmUser)
    .filter((user) => user.role === "Sales Manager" || user.role === "Admin")
    .map((user) => ({ id: user.id, name: user.name, role: user.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Internal approved users eligible for lead assignment automations. */
export function getAssignableManagerUserOptions(users: AuthUser[]): CrmManagerUserOption[] {
  return users
    .filter(isInternalCrmUser)
    .filter(
      (user) =>
        user.role === "Admin" ||
        user.role === "Account Manager" ||
        user.role === "Sales Manager" ||
        user.role === "Team Lead",
    )
    .map((user) => ({ id: user.id, name: user.name, role: user.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getManagerUserOptionsForRole(
  users: AuthUser[],
  role: "account" | "sales",
): CrmManagerUserOption[] {
  return role === "account" ? getAccountManagerUserOptions(users) : getSalesManagerUserOptions(users);
}
