import { getThreeCxEnvConfig } from "@/lib/call-center/env";
import { getThreeCxAccessToken, clearThreeCxTokenCache } from "@/lib/call-center/token";

export type ThreeCxDevice = {
  id: string;
  name: string | null;
  userAgent: string | null;
};

export type MakeCallParams = {
  dn: string;
  destination: string;
  deviceId?: string | null;
  timeoutSec?: number;
};

export type MakeCallResult = {
  ok: true;
  status: number;
  body: unknown;
};

export type ThreeCxParticipant = {
  id: number;
  status: string;
  dn: string | null;
  partyCallerName: string | null;
  partyDn: string | null;
  partyCallerId: string | null;
  partyDid: string | null;
  deviceId: string | null;
  partyDnType: string | null;
  directControl: boolean;
  callId: number | null;
  legId: number | null;
};

export type ParticipantAction = "answer" | "drop" | "divert" | "transferto";

export async function threeCxAuthorizedFetch(
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const config = getThreeCxEnvConfig();
  if (!config) {
    throw new Error("3CX is not configured (THREECX_BASE_URL / CLIENT_ID / CLIENT_SECRET).");
  }
  const token = await getThreeCxAccessToken(fetchImpl);
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res = await fetchImpl(url, { ...init, headers });
  if (res.status === 401) {
    clearThreeCxTokenCache();
    const retryToken = await getThreeCxAccessToken(fetchImpl);
    headers.set("Authorization", `Bearer ${retryToken}`);
    res = await fetchImpl(url, { ...init, headers });
  }
  return res;
}

async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return threeCxAuthorizedFetch(path, init, fetchImpl);
}

function readDevice(raw: unknown): ThreeCxDevice | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id =
    (typeof row.device_id === "string" && row.device_id) ||
    (typeof row.deviceId === "string" && row.deviceId) ||
    (typeof row.id === "string" && row.id) ||
    (typeof row.dn === "string" && row.dn) ||
    null;
  if (!id) return null;
  const name =
    (typeof row.name === "string" && row.name) ||
    (typeof row.friendly_name === "string" && row.friendly_name) ||
    (typeof row.device_name === "string" && row.device_name) ||
    null;
  const userAgent =
    (typeof row.user_agent === "string" && row.user_agent) ||
    (typeof row.userAgent === "string" && row.userAgent) ||
    null;
  return { id, name, userAgent };
}

export async function listThreeCxDevices(
  dn: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ThreeCxDevice[]> {
  const extension = dn.trim();
  if (!extension) throw new Error("Extension is required.");
  const res = await authorizedFetch(
    `/callcontrol/${encodeURIComponent(extension)}/devices`,
    { method: "GET" },
    fetchImpl,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      json && typeof json === "object" && "reasontext" in json
        ? String((json as { reasontext?: unknown }).reasontext ?? "")
        : `HTTP ${res.status}`;
    throw new Error(`Failed to list 3CX devices: ${detail || res.status}`);
  }

  const list = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { devices?: unknown }).devices)
      ? (json as { devices: unknown[] }).devices
      : json && typeof json === "object" && Array.isArray((json as { value?: unknown }).value)
        ? (json as { value: unknown[] }).value
        : [];

  return list.map(readDevice).filter((d): d is ThreeCxDevice => Boolean(d));
}

export function buildMakeCallPath(dn: string, deviceId?: string | null): string {
  const extension = encodeURIComponent(dn.trim());
  if (deviceId?.trim()) {
    return `/callcontrol/${extension}/devices/${encodeURIComponent(deviceId.trim())}/makecall`;
  }
  return `/callcontrol/${extension}/makecall`;
}

export function buildMakeCallBody(destination: string, timeoutSec = 30): Record<string, unknown> {
  return {
    destination,
    timeout: timeoutSec,
  };
}

export async function makeThreeCxCall(
  params: MakeCallParams,
  fetchImpl: typeof fetch = fetch,
): Promise<MakeCallResult> {
  const dn = params.dn.trim();
  if (!dn) throw new Error("Extension is required.");
  const destination = params.destination.trim();
  if (!destination) throw new Error("Destination phone is required.");

  const path = buildMakeCallPath(dn, params.deviceId);
  const body = buildMakeCallBody(destination, params.timeoutSec ?? 30);
  const res = await authorizedFetch(
    path,
    { method: "POST", body: JSON.stringify(body) },
    fetchImpl,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok && res.status !== 202) {
    const detail =
      json && typeof json === "object"
        ? String(
            (json as { reasontext?: unknown; reason?: unknown; error?: unknown }).reasontext ??
              (json as { reason?: unknown }).reason ??
              (json as { error?: unknown }).error ??
              "",
          )
        : "";
    throw new Error(detail || `3CX makecall failed (HTTP ${res.status}).`);
  }
  return { ok: true, status: res.status, body: json };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function readParticipant(raw: unknown): ThreeCxParticipant | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = asNumber(row.id);
  if (id == null) return null;
  return {
    id,
    status: asString(row.status) ?? "Unknown",
    dn: asString(row.dn),
    partyCallerName: asString(row.party_caller_name) ?? asString(row.partyCallerName),
    partyDn: asString(row.party_dn) ?? asString(row.partyDn),
    partyCallerId: asString(row.party_caller_id) ?? asString(row.partyCallerId),
    partyDid: asString(row.party_did) ?? asString(row.partyDid),
    deviceId: asString(row.device_id) ?? asString(row.deviceId),
    partyDnType: asString(row.party_dn_type) ?? asString(row.partyDnType),
    directControl: Boolean(row.direct_control ?? row.directControl),
    callId: asNumber(row.callid) ?? asNumber(row.callId),
    legId: asNumber(row.legid) ?? asNumber(row.legId),
  };
}

function unwrapList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.participants)) return obj.participants;
    if (Array.isArray(obj.value)) return obj.value;
    if (Array.isArray(obj.devices)) return obj.devices;
  }
  return [];
}

export async function listThreeCxParticipants(
  dn: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ThreeCxParticipant[]> {
  const extension = dn.trim();
  if (!extension) throw new Error("Extension is required.");
  const res = await authorizedFetch(
    `/callcontrol/${encodeURIComponent(extension)}/participants`,
    { method: "GET" },
    fetchImpl,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      json && typeof json === "object"
        ? String((json as { reasontext?: unknown }).reasontext ?? "")
        : "";
    throw new Error(detail || `Failed to list participants (HTTP ${res.status}).`);
  }
  return unwrapList(json)
    .map(readParticipant)
    .filter((p): p is ThreeCxParticipant => Boolean(p));
}

export async function threeCxParticipantAction(
  params: {
    dn: string;
    participantId: number;
    action: ParticipantAction;
    destination?: string;
    timeoutSec?: number;
    reason?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<MakeCallResult> {
  const dn = params.dn.trim();
  if (!dn) throw new Error("Extension is required.");
  const action = params.action;
  const path = `/callcontrol/${encodeURIComponent(dn)}/participants/${params.participantId}/${action}`;

  let body: Record<string, unknown> | undefined;
  if (action === "divert" || action === "transferto") {
    const destination = params.destination?.trim();
    if (!destination) throw new Error("Destination is required for this action.");
    body = {
      reason: params.reason ?? "None",
      destination,
      timeout: params.timeoutSec ?? 30,
    };
  }

  const res = await authorizedFetch(
    path,
    {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    },
    fetchImpl,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok && res.status !== 202) {
    const detail =
      json && typeof json === "object"
        ? String(
            (json as { reasontext?: unknown; reason?: unknown; error?: unknown }).reasontext ??
              (json as { reason?: unknown }).reason ??
              (json as { error?: unknown }).error ??
              "",
          )
        : "";
    throw new Error(detail || `3CX ${action} failed (HTTP ${res.status}).`);
  }
  return { ok: true, status: res.status, body: json };
}

