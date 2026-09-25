import type { AppPageKey } from "@/types/auth";
import { sanitizeSameOriginReturnPath } from "@/lib/safe-return-url";
import {
  canAccessSalesOperationPath,
  LEGACY_CRM_ROUTE_PAGES,
  resolvePostLoginPath,
  STAFF_NO_ACCESS_PATH,
} from "@/lib/role-permissions";

export function buildLoginHref(returnPath: string): string {
  const safe = sanitizeSameOriginReturnPath(returnPath);
  if (!safe) return "/login";
  return `/login?next=${encodeURIComponent(safe)}`;
}

function isStaffReturnPathAllowed(
  path: string,
  canAccess: (page: AppPageKey) => boolean,
): boolean {
  if (path.startsWith("/sales-operation")) {
    return canAccessSalesOperationPath(path, canAccess);
  }
  for (const route of LEGACY_CRM_ROUTE_PAGES) {
    if (path.startsWith(route.path) && canAccess(route.page)) {
      return true;
    }
  }
  return false;
}

/** True when path is a valid staff deep link but RBAC denies it (show no-access, not redirect loop). */
export function isForbiddenStaffReturnPath(input: {
  accountType?: string | null;
  canAccess: (page: AppPageKey) => boolean;
  returnPath?: string | null;
}): boolean {
  const safeReturn = sanitizeSameOriginReturnPath(input.returnPath);
  if (!safeReturn || input.accountType === "client") return false;
  if (safeReturn.startsWith("/client")) return false;
  if (!safeReturn.startsWith("/sales-operation") && !LEGACY_CRM_ROUTE_PAGES.some((r) => safeReturn.startsWith(r.path))) {
    return false;
  }
  return !isStaffReturnPathAllowed(safeReturn, input.canAccess);
}

export function resolveAuthenticatedLandingPath(input: {
  accountType?: string | null;
  canAccess: (page: AppPageKey) => boolean;
  returnPath?: string | null;
}): string {
  const safeReturn = sanitizeSameOriginReturnPath(input.returnPath);
  if (safeReturn) {
    if (safeReturn.startsWith("/client")) {
      if (input.accountType === "client") return safeReturn;
    } else if (input.accountType !== "client") {
      if (isStaffReturnPathAllowed(safeReturn, input.canAccess)) {
        return safeReturn;
      }
      // Valid same-origin staff path but missing permission: land on URL; layout shows no-access.
      if (
        safeReturn.startsWith("/sales-operation") ||
        LEGACY_CRM_ROUTE_PAGES.some((route) => safeReturn.startsWith(route.path))
      ) {
        return safeReturn;
      }
    }
  }
  const landing = resolvePostLoginPath({
    accountType: input.accountType,
    canAccess: input.canAccess,
  });
  if (landing) return landing;
  if (input.accountType === "client") return "/client/request-rides";
  return STAFF_NO_ACCESS_PATH;
}
