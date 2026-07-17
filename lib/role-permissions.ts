import {
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type AppPageKey,
  type AppRole,
  type RoleAreaAccess,
  type RoleDashboardBlockAccess,
  type RolePermissions,
} from "@/types/auth";

export const APP_ROLES: AppRole[] = [
  "Admin",
  "User",
  "Team Lead",
  "Account Manager",
  "Sales Manager",
];

export const SALES_OPERATION_PAGE_KEYS = [
  "salesOperation",
  "salesPipeline",
  "salesSignedClients",
  "salesB2BClients",
  "salesAnalytics",
  "salesManagerAnalytics",
  "salesAutomation",
  "salesSettings",
] as const satisfies readonly AppPageKey[];

export type SalesOperationPageKey = (typeof SALES_OPERATION_PAGE_KEYS)[number];

export const CURRENT_PERMISSIONS_VERSION = 11;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function isSalesOperationPageKey(page: AppPageKey): page is SalesOperationPageKey {
  return (SALES_OPERATION_PAGE_KEYS as readonly AppPageKey[]).includes(page);
}

export function buildAllPageAccess(value: boolean): Record<AppPageKey, boolean> {
  return Object.fromEntries(
    (Object.keys(defaultRolePermissions.Admin) as AppPageKey[]).map((key) => [key, value]),
  ) as Record<AppPageKey, boolean>;
}

function migrateSalesSubPages(
  merged: Record<AppPageKey, boolean>,
  storedVersion: number,
  stored: Partial<Record<AppPageKey, boolean>> | undefined,
): Record<AppPageKey, boolean> {
  if (storedVersion >= CURRENT_PERMISSIONS_VERSION) {
    return merged;
  }
  const legacySales = merged.salesOperation ?? false;
  for (const key of SALES_OPERATION_PAGE_KEYS) {
    if (key === "salesOperation") continue;
    // salesSettings is Admin-only by default; keep the role default instead of
    // inheriting the broad salesOperation flag.
    if (key === "salesSettings") continue;
    if (storedVersion < CURRENT_PERMISSIONS_VERSION && stored?.[key] === undefined) {
      merged[key] = legacySales;
    } else if (merged[key] === undefined) {
      merged[key] = legacySales;
    }
  }
  return merged;
}

export function mergeRolePermissions(
  role: AppRole,
  stored: Partial<Record<AppPageKey, boolean>> | undefined,
  storedVersion: number,
): Record<AppPageKey, boolean> {
  const merged = {
    ...defaultRolePermissions[role],
    ...(stored ?? {}),
  } as Record<AppPageKey, boolean>;

  if (storedVersion < 8) {
    merged.orders = merged.orders ?? true;
    merged.preOrders = merged.preOrders ?? true;
    merged.communications = merged.communications ?? true;
    merged.financialCenter = merged.financialCenter ?? true;
    if (merged.salesOperation === undefined) {
      merged.salesOperation = role === "Admin";
    }
  }

  return migrateSalesSubPages(merged, storedVersion, stored);
}

export function mergeAllRolePermissions(
  storedPermissions: Partial<RolePermissions> | undefined,
  storedVersion: number,
): RolePermissions {
  const result = {} as RolePermissions;
  for (const role of APP_ROLES) {
    result[role] = mergeRolePermissions(role, storedPermissions?.[role], storedVersion);
  }
  return result;
}

export function mergeAllRoleAreaAccess(
  stored: Partial<RoleAreaAccess> | undefined,
): RoleAreaAccess {
  const result = {} as RoleAreaAccess;
  for (const role of APP_ROLES) {
    result[role] = {
      ...defaultRoleAreaAccess[role],
      ...(stored?.[role] ?? {}),
    };
  }
  return result;
}

export function mergeAllRoleDashboardBlockAccess(
  stored: Partial<RoleDashboardBlockAccess> | undefined,
): RoleDashboardBlockAccess {
  const result = {} as RoleDashboardBlockAccess;
  for (const role of APP_ROLES) {
    result[role] = {
      ...defaultRoleDashboardBlockAccess[role],
      ...(stored?.[role] ?? {}),
    };
  }
  return result;
}

export const SALES_OPERATION_ROUTE_PAGES: Array<{ prefix: string; page: SalesOperationPageKey }> = [
  { prefix: "/sales-operation/pipeline", page: "salesPipeline" },
  { prefix: "/sales-operation/clients", page: "salesSignedClients" },
  { prefix: "/sales-operation/b2b-clients", page: "salesB2BClients" },
  { prefix: "/sales-operation/manager-analytics", page: "salesManagerAnalytics" },
  { prefix: "/sales-operation/analytics", page: "salesAnalytics" },
  { prefix: "/sales-operation/automation", page: "salesAutomation" },
  { prefix: "/sales-operation/settings", page: "salesSettings" },
];

export function resolveSalesOperationPageKey(pathname: string): SalesOperationPageKey {
  if (pathname.startsWith("/sales-operation/pipeline")) return "salesPipeline";
  if (pathname.startsWith("/sales-operation/clients")) return "salesSignedClients";
  if (pathname.startsWith("/sales-operation/b2b-clients")) return "salesB2BClients";
  if (pathname.startsWith("/sales-operation/manager-analytics")) return "salesManagerAnalytics";
  if (pathname.startsWith("/sales-operation/analytics")) return "salesAnalytics";
  if (pathname.startsWith("/sales-operation/automation")) return "salesAutomation";
  if (pathname.startsWith("/sales-operation/settings")) return "salesSettings";
  return "salesPipeline";
}

export function firstAllowedSalesOperationPath(
  canAccess: (page: AppPageKey) => boolean,
): string | null {
  for (const route of SALES_OPERATION_ROUTE_PAGES) {
    if (canAccess("salesOperation") && canAccess(route.page)) {
      return route.prefix;
    }
  }
  return null;
}
