import type { AppRole } from "@/types/auth";

/** User / Team Lead My Space: own data only until owner defines team visibility for Team Lead. */
const OWN_DATA_ONLY_ROLES: readonly AppRole[] = ["User", "Team Lead"];

export function resolveSalesTasksListScope(
  role: AppRole,
  scopeParam: string | null,
): "mine" | "created" | "all" {
  if (scopeParam === "created") return "created";
  if (scopeParam === "all" && !OWN_DATA_ONLY_ROLES.includes(role)) {
    return "all";
  }
  return "mine";
}

export function isOwnDataOnlyStaffRole(role: AppRole): boolean {
  return OWN_DATA_ONLY_ROLES.includes(role);
}
