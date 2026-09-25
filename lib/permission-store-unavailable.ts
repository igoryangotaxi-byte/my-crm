import { NextResponse } from "next/server";

export const PERMISSION_STORE_UNAVAILABLE_CODE = "PERMISSION_STORE_UNAVAILABLE" as const;

const DEFAULT_AUTH_STORE_MAX_STALE_MS = 0;

/**
 * Max age for serving a last-good in-process KV snapshot after a read failure (PR B).
 * Env: `AUTH_STORE_MAX_STALE_MS` (milliseconds). Default **0** = no stale serving beyond the 30s read cache; fail closed on KV error.
 * Example: `600000` for 10 minutes (not enabled in prod until owner approves).
 */
export function getAuthStoreMaxStaleMs(): number {
  const raw = process.env.AUTH_STORE_MAX_STALE_MS?.trim();
  if (!raw) {
    return DEFAULT_AUTH_STORE_MAX_STALE_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_AUTH_STORE_MAX_STALE_MS;
  }
  return parsed;
}

export class PermissionStoreUnavailableError extends Error {
  readonly code = PERMISSION_STORE_UNAVAILABLE_CODE;

  constructor(message = "Permission store unavailable") {
    super(message);
    this.name = "PermissionStoreUnavailableError";
  }
}

export function isPermissionStoreUnavailableError(error: unknown): error is PermissionStoreUnavailableError {
  return error instanceof PermissionStoreUnavailableError;
}

export function permissionStoreUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: PERMISSION_STORE_UNAVAILABLE_CODE,
        nothingSent: true,
      },
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
