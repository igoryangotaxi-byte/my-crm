export const PERMISSION_DENIED_CODE = "PERMISSION_DENIED" as const;
export const PERMISSION_STORE_UNAVAILABLE_CODE = "PERMISSION_STORE_UNAVAILABLE" as const;

export type OpsPermissionErrorCode =
  | typeof PERMISSION_DENIED_CODE
  | typeof PERMISSION_STORE_UNAVAILABLE_CODE;

export type OpsPermissionErrorBody = {
  error: {
    code: OpsPermissionErrorCode;
    nothingSent?: boolean;
  };
};

export class PermissionStoreUnavailableError extends Error {
  override name = "PermissionStoreUnavailableError";
}

export function permissionDeniedResponse(): Response {
  return Response.json(
    { error: { code: PERMISSION_DENIED_CODE } } satisfies OpsPermissionErrorBody,
    { status: 403 },
  );
}

export function permissionStoreUnavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: PERMISSION_STORE_UNAVAILABLE_CODE,
        nothingSent: true,
      },
    } satisfies OpsPermissionErrorBody,
    { status: 503 },
  );
}

export function parseOpsPermissionErrorBody(body: unknown): OpsPermissionErrorBody["error"] | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (code === PERMISSION_DENIED_CODE || code === PERMISSION_STORE_UNAVAILABLE_CODE) {
    return error as OpsPermissionErrorBody["error"];
  }
  return null;
}

export function isPermissionStoreUnavailable(
  response: Response,
  body?: unknown,
): boolean {
  if (response.status !== 503) return false;
  if (body !== undefined) {
    return parseOpsPermissionErrorBody(body)?.code === PERMISSION_STORE_UNAVAILABLE_CODE;
  }
  return false;
}

export function isPermissionDenied(response: Response, body?: unknown): boolean {
  if (response.status !== 403) return false;
  if (body !== undefined) {
    const parsed = parseOpsPermissionErrorBody(body);
    return parsed?.code === PERMISSION_DENIED_CODE || parsed === null;
  }
  return true;
}

export function classifyOpsApiPayload(
  status: number,
  body: unknown,
): "forbidden" | "store_unavailable" | "unknown" | null {
  if (status === 403 && isPermissionDenied({ status } as Response, body)) {
    return "forbidden";
  }
  if (status === 503 && isPermissionStoreUnavailable({ status } as Response, body)) {
    return "store_unavailable";
  }
  if (status >= 500 || status === 408 || status === 504) return "unknown";
  if (!body && status >= 400) return null;
  if (status >= 400 && status !== 401 && status !== 400) return "unknown";
  return null;
}
