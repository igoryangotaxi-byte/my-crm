import type { AppPageKey } from "@/types/auth";
import { sanitizeSameOriginReturnPath } from "@/lib/safe-return-url";
import {
  canAccessSalesOperationPath,
  LEGACY_CRM_ROUTE_PAGES,
  resolvePostLoginPath,
} from "@/lib/role-permissions";

export function buildLoginHref(returnPath: string): string {
  const safe = sanitizeSameOriginReturnPath(returnPath);
  if (!safe) return "/login";
  return `/login?next=${encodeURIComponent(safe)}`;
}

export function resolveAuthenticatedLandingPath(input: {
  accountType?: string | null;
  canAccess: (page: AppPageKey) => boolean;
  returnPath?: string | null;
}): string | null {
  const safeReturn = sanitizeSameOriginReturnPath(input.returnPath);
  if (safeReturn) {
    if (safeReturn.startsWith("/sales-operation")) {
      if (canAccessSalesOperationPath(safeReturn, input.canAccess)) {
        return safeReturn;
      }
    } else if (safeReturn.startsWith("/client")) {
      if (input.accountType === "client") {
        return safeReturn;
      }
    } else {
      for (const route of LEGACY_CRM_ROUTE_PAGES) {
        if (safeReturn.startsWith(route.path) && input.canAccess(route.page)) {
          return safeReturn;
        }
      }
    }
  }
  return resolvePostLoginPath({
    accountType: input.accountType,
    canAccess: input.canAccess,
  });
}
