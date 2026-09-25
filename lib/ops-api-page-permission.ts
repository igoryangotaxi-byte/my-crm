import {
  CURRENT_PERMISSIONS_VERSION,
  mergeRolePermissions,
} from "@/lib/role-permissions";
import { loadAuthStoreForRequest } from "@/lib/auth-store";
import {
  PermissionStoreUnavailableError,
  permissionDeniedResponse,
  permissionStoreUnavailableResponse,
} from "@/lib/permission-store-errors";
import type { AppPageKey, AuthUser, ClientPortalPageKey, AuthStoreData } from "@/types/auth";

const CLIENT_PORTAL_KEY: Partial<Record<AppPageKey, ClientPortalPageKey>> = {
  requestRides: "requestRides",
  preOrders: "preOrders",
  orders: "orders",
  communications: "communications",
  financialCenter: "financialCenter",
  driversMap: "driversMap",
};

export function isEnforceOpsApiPermissions(): boolean {
  const v = (process.env.ENFORCE_OPS_API_PERMISSIONS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function jerusalemLogTime(): string {
  return new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
  });
}

export type OpsApiPermissionStoreLoader = (
  request: Request,
  options?: { store?: AuthStoreData },
) => Promise<AuthStoreData>;

let permissionStoreLoader: OpsApiPermissionStoreLoader = async (request, options) => {
  if (options?.store) return options.store;
  return loadAuthStoreForRequest(request);
};

/**
 * Switch the store loader used by ops API guards (e.g. fail-closed loader from
 * `cursor/auth-fail-closed-c8b4`). Pass `null` to restore the default request-scoped cache.
 */
export function setOpsApiPermissionStoreLoader(loader: OpsApiPermissionStoreLoader | null): void {
  permissionStoreLoader =
    loader ??
    (async (request, options) => {
      if (options?.store) return options.store;
      return loadAuthStoreForRequest(request);
    });
}

/** Test hook: simulate permission store outage or fixed store data. */
export function __setPermissionStoreLoaderForTests(
  loader: ((request: Request) => Promise<AuthStoreData>) | null,
): void {
  if (loader === null) {
    setOpsApiPermissionStoreLoader(null);
    return;
  }
  setOpsApiPermissionStoreLoader(async (request) => loader(request));
}

async function loadPermissionStore(
  request: Request,
  options?: { store?: AuthStoreData },
): Promise<AuthStoreData> {
  return permissionStoreLoader(request, options);
}

function staffRoleAllows(store: AuthStoreData, user: AuthUser, page: AppPageKey): boolean {
  const merged = mergeRolePermissions(
    user.role,
    store.rolePermissions[user.role],
    store.storeMeta?.permissionsVersion ?? CURRENT_PERMISSIONS_VERSION,
  );
  return Boolean(merged[page]);
}

function clientPortalAllows(store: AuthStoreData, user: AuthUser, page: AppPageKey): boolean {
  const portalKey = CLIENT_PORTAL_KEY[page];
  if (!portalKey) return false;
  if (!user.tenantId || !user.clientRoleId) return false;
  const role = store.tenantRoles?.[user.tenantId]?.find((item) => item.id === user.clientRoleId);
  return Boolean(role?.permissions[portalKey]);
}

function userHasOpsPagePermissionFromStore(
  store: AuthStoreData,
  user: AuthUser,
  required: AppPageKey | AppPageKey[],
): boolean {
  const keys = Array.isArray(required) ? required : [required];
  if (user.accountType === "client") {
    return keys.some((key) => clientPortalAllows(store, user, key));
  }
  for (const key of keys) {
    if (staffRoleAllows(store, user, key)) return true;
  }
  return false;
}

export async function userHasOpsPagePermission(
  user: AuthUser,
  required: AppPageKey | AppPageKey[],
  request?: Request,
  options?: { store?: AuthStoreData },
): Promise<boolean> {
  const store = request
    ? await loadPermissionStore(request, options)
    : await loadPermissionStore(new Request("http://localhost"), options);
  return userHasOpsPagePermissionFromStore(store, user, required);
}

function firstMissingKey(required: AppPageKey[]): AppPageKey {
  return required[0];
}

export type GuardOpsApiPagePermissionOptions = {
  /** Reuse the store already loaded in `requireApprovedUser` for this request. */
  store?: AuthStoreData;
};

/**
 * Run immediately after `requireApprovedUser` and **before** reading body / side effects.
 * LOG-ONLY by default (`ENFORCE_OPS_API_PERMISSIONS` off): logs would-be denial or store
 * outage, request continues. When enforce is on: 403 on missing permission, 503 when the
 * configured loader throws {@link PermissionStoreUnavailableError}.
 */
export async function guardOpsApiPagePermission(
  user: AuthUser,
  request: Request,
  required: AppPageKey | AppPageKey[],
  options?: GuardOpsApiPagePermissionOptions,
): Promise<Response | null> {
  const keys = Array.isArray(required) ? required : [required];
  const route = new URL(request.url).pathname;

  let store: AuthStoreData;
  try {
    store = await loadPermissionStore(request, options);
  } catch (error) {
    if (error instanceof PermissionStoreUnavailableError) {
      console.warn(
        JSON.stringify({
          kind: "ops_api_permission_store_unavailable",
          at: jerusalemLogTime(),
          userId: user.id,
          role: user.role,
          route,
          enforce: isEnforceOpsApiPermissions(),
        }),
      );
      if (!isEnforceOpsApiPermissions()) {
        return null;
      }
      return permissionStoreUnavailableResponse();
    }
    throw error;
  }

  const allowed = userHasOpsPagePermissionFromStore(store, user, keys);
  if (allowed) return null;

  const missing = firstMissingKey(keys);
  console.warn(
    JSON.stringify({
      kind: "ops_api_permission_would_deny",
      at: jerusalemLogTime(),
      userId: user.id,
      role: user.role,
      route,
      missingPermission: missing,
      enforce: isEnforceOpsApiPermissions(),
    }),
  );

  if (!isEnforceOpsApiPermissions()) {
    return null;
  }

  return permissionDeniedResponse();
}
