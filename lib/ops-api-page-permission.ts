import { loadAuthStore } from "@/lib/auth-store";
import {
  CURRENT_PERMISSIONS_VERSION,
  mergeRolePermissions,
} from "@/lib/role-permissions";
import type { AppPageKey, AuthUser, ClientPortalPageKey } from "@/types/auth";

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

async function staffRoleAllows(user: AuthUser, page: AppPageKey): Promise<boolean> {
  const store = await loadAuthStore();
  const merged = mergeRolePermissions(
    user.role,
    store.rolePermissions[user.role],
    store.storeMeta?.permissionsVersion ?? CURRENT_PERMISSIONS_VERSION,
  );
  return Boolean(merged[page]);
}

async function clientPortalAllows(user: AuthUser, page: AppPageKey): Promise<boolean> {
  const portalKey = CLIENT_PORTAL_KEY[page];
  if (!portalKey) return false;
  if (!user.tenantId || !user.clientRoleId) return false;
  const store = await loadAuthStore();
  const role = store.tenantRoles?.[user.tenantId]?.find((item) => item.id === user.clientRoleId);
  return Boolean(role?.permissions[portalKey]);
}

export async function userHasOpsPagePermission(
  user: AuthUser,
  required: AppPageKey | AppPageKey[],
): Promise<boolean> {
  const keys = Array.isArray(required) ? required : [required];
  if (user.accountType === "client") {
    return keys.some((key) => clientPortalAllows(user, key));
  }
  for (const key of keys) {
    if (await staffRoleAllows(user, key)) return true;
  }
  return false;
}

function firstMissingKey(
  user: AuthUser,
  required: AppPageKey[],
): AppPageKey {
  return required[0];
}

/**
 * Run immediately after `requireApprovedUser` and **before** reading body / side effects.
 * LOG-ONLY by default (`ENFORCE_OPS_API_PERMISSIONS` off): logs would-be denial, request continues.
 */
export async function guardOpsApiPagePermission(
  user: AuthUser,
  request: Request,
  required: AppPageKey | AppPageKey[],
): Promise<Response | null> {
  const keys = Array.isArray(required) ? required : [required];
  const allowed = await userHasOpsPagePermission(user, keys);
  if (allowed) return null;

  const missing = firstMissingKey(user, keys);
  const route = new URL(request.url).pathname;
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

  return Response.json(
    {
      ok: false,
      error: "Forbidden.",
      missingPermission: missing,
    },
    { status: 403 },
  );
}
