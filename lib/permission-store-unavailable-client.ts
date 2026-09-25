import { PERMISSION_STORE_UNAVAILABLE_CODE } from "@/lib/permission-store-unavailable";

type PermissionStoreUnavailableBody = {
  error?: {
    code?: string;
    nothingSent?: boolean;
  };
};

/** True when a fetch to the auth/permission API returned 503 PERMISSION_STORE_UNAVAILABLE. */
export function isPermissionStoreUnavailable(
  response: Response,
  body?: unknown,
): boolean {
  if (response.status !== 503) {
    return false;
  }
  const parsed =
    body && typeof body === "object" ? (body as PermissionStoreUnavailableBody) : null;
  return (
    parsed?.error?.code === PERMISSION_STORE_UNAVAILABLE_CODE &&
    parsed?.error?.nothingSent === true
  );
}
