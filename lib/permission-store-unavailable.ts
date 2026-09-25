import { NextResponse } from "next/server";

export const PERMISSION_STORE_UNAVAILABLE_CODE = "PERMISSION_STORE_UNAVAILABLE" as const;

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
