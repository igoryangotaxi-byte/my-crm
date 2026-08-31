import { threeCxAuthorizedFetch } from "@/lib/call-center/client";

export type ThreeCxXapiUserSnapshot = {
  id: string;
  number: string | null;
  currentProfileName: string | null;
  queueStatus: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapUser(raw: unknown): ThreeCxXapiUserSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id =
    asString(row.Id) ??
    asString(row.id) ??
    (typeof row.Id === "number" ? String(row.Id) : null) ??
    (typeof row.id === "number" ? String(row.id) : null);
  if (!id) return null;
  return {
    id,
    number: asString(row.Number) ?? asString(row.number) ?? asString(row.ExtensionNumber),
    currentProfileName:
      asString(row.CurrentProfileName) ?? asString(row.currentProfileName) ?? null,
    queueStatus: asString(row.QueueStatus) ?? asString(row.queueStatus) ?? null,
  };
}

function unwrapUsers(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as { value?: unknown }).value)) {
    return (json as { value: unknown[] }).value;
  }
  return [];
}

export async function findThreeCxUserByExtension(
  extension: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ThreeCxXapiUserSnapshot | null> {
  const dn = extension.trim();
  if (!dn) return null;

  // Prefer OData filter; fall back to scanning first page if filter unsupported.
  const filter = encodeURIComponent(`Number eq '${dn.replace(/'/g, "''")}'`);
  const filtered = await threeCxAuthorizedFetch(
    `/xapi/v1/Users?$filter=${filter}&$top=5`,
    { method: "GET" },
    fetchImpl,
  );
  if (filtered.ok) {
    const json = await filtered.json().catch(() => null);
    const hit = unwrapUsers(json).map(mapUser).find((u) => u?.number === dn);
    if (hit) return hit;
  }

  const list = await threeCxAuthorizedFetch(`/xapi/v1/Users?$top=200`, { method: "GET" }, fetchImpl);
  if (!list.ok) return null;
  const json = await list.json().catch(() => null);
  return unwrapUsers(json).map(mapUser).find((u) => u?.number === dn) ?? null;
}

export async function setThreeCxQueueStatus(
  userId: string,
  loggedIn: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing 3CX user id." };
  const res = await threeCxAuthorizedFetch(
    `/xapi/v1/Users(${encodeURIComponent(id)})`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ QueueStatus: loggedIn ? "LoggedIn" : "LoggedOut" }),
    },
    fetchImpl,
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: text || `HTTP ${res.status}` };
  }
  return { ok: true };
}
