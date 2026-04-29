import {
  b2bDashboardOrderKey,
  getB2BOrderDetails,
  listYangoClientUsers,
  pullB2BOrdersRows,
} from "@/lib/yango-api";
import {
  getClientEmployeeControls,
  upsertClientEmployeeControl,
} from "@/lib/client-employee-controls";
import {
  getTenantEmployeeLinks,
  setTenantEmployeeLinks,
} from "@/lib/client-employee-links";
import { loadAuthStore } from "@/lib/auth-store";
import { normalizePhoneKey } from "@/lib/request-rides-user-map";
import { requireClientScopedUser } from "@/lib/server-auth";
import type { B2BDashboardOrder } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseIso(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
}

function normalizeDateRange(input: { since?: unknown; till?: unknown }) {
  const now = new Date();
  const fallbackSince = new Date(now);
  fallbackSince.setDate(now.getDate() - 30);
  const since = parseIso(input.since) ?? fallbackSince.toISOString();
  const till = parseIso(input.till) ?? now.toISOString();
  return { since, till };
}

function collectStringFields(
  value: unknown,
  keys: Set<string>,
  acc: Record<string, string[]>,
  depth = 0,
) {
  if (depth > 4 || !value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(node)) {
    const lower = k.toLowerCase();
    if (typeof v === "string" && keys.has(lower)) {
      if (!acc[lower]) acc[lower] = [];
      const trimmed = v.trim();
      if (trimmed) acc[lower].push(trimmed);
    } else if (v && typeof v === "object") {
      collectStringFields(v, keys, acc, depth + 1);
    }
  }
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return null;
}

type EmployeeActivityBucket = {
  userId: string;
  displayName: string | null;
  phone: string | null;
  rides: number;
  cancelled: number;
  spend: number;
  lastRoutes: string[];
};

function normalizeNameKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadRowsForRange(scope: { tokenLabel: string; clientId: string }, since: string, till: string) {
  const rows: B2BDashboardOrder[] = [];
  let cursors: Record<string, number> = {};
  let hasMore = true;
  const excludeKeys = new Set<string>();
  const maxOrders = 200;

  while (hasMore && rows.length < maxOrders) {
    const chunk = await pullB2BOrdersRows({
      since,
      till,
      startCursors: cursors,
      targetNewCount: Math.min(100, maxOrders - rows.length),
      excludeKeys,
      excludeScheduling: true,
      scope,
    });
    for (const row of chunk.newRows) {
      rows.push(row);
      excludeKeys.add(b2bDashboardOrderKey(row));
    }
    cursors = chunk.nextCursors;
    hasMore = chunk.hasMoreRemote;
    if (chunk.newRows.length === 0) break;
  }
  return rows;
}

export async function GET(request: Request) {
  const auth = await requireClientScopedUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const range = normalizeDateRange({
    since: url.searchParams.get("since"),
    till: url.searchParams.get("till"),
  });
  const scope = { tokenLabel: auth.scope.tokenLabel, clientId: auth.scope.apiClientId };
  const rows = await loadRowsForRange(scope, range.since, range.till);
  const directory = await listYangoClientUsers({
    tokenLabel: scope.tokenLabel,
    clientId: scope.clientId,
    limit: 600,
  }).catch(() => []);
  const authStore = await loadAuthStore();
  const tenantUsers = authStore.users.filter(
    (user) => user.accountType === "client" && user.tenantId === auth.scope.tenantId,
  );
  const tenantNameByUserId = new Map(
    tenantUsers
      .map((user) => [user.id, user.name?.trim() ?? ""] as const)
      .filter(([, name]) => Boolean(name)),
  );
  const tenantNameByPhone = new Map<string, string>();
  for (const user of tenantUsers) {
    const key = normalizePhoneKey(user.phoneNumber ?? "");
    const name = user.name?.trim();
    if (key && name) tenantNameByPhone.set(key, name);
  }
  const controls = getClientEmployeeControls(auth.scope.tenantId);
  const persistedLinks = getTenantEmployeeLinks(auth.scope.tenantId);

  const probeKeys = new Set([
    "user_id",
    "userid",
    "user_name",
    "username",
    "full_name",
    "fullname",
    "phone",
    "phone_number",
    "msisdn",
  ]);
  const byUser = new Map<string, EmployeeActivityBucket>();

  for (let i = 0; i < rows.length; i += 6) {
    const batch = rows.slice(i, i + 6);
    const resolved = await Promise.all(
      batch.map(async (row) => {
        try {
          const details = await getB2BOrderDetails({
            tokenLabel: row.tokenLabel,
            clientId: row.clientId ?? scope.clientId,
            orderId: row.orderId,
          });
          return { row, details };
        } catch {
          return { row, details: null };
        }
      }),
    );
    for (const item of resolved) {
      if (!item.details) continue;
      const hits: Record<string, string[]> = {};
      collectStringFields(item.details.info, probeKeys, hits);
      collectStringFields(item.details.progress, probeKeys, hits);
      collectStringFields(item.details.report, probeKeys, hits);
      const userId = firstNonEmpty([hits.user_id?.[0], hits.userid?.[0]]) ?? null;
      if (!userId) continue;
      const displayName =
        firstNonEmpty([
          hits.full_name?.[0],
          hits.fullname?.[0],
          hits.user_name?.[0],
          hits.username?.[0],
        ]) ?? null;
      const phone =
        firstNonEmpty([hits.phone?.[0], hits.phone_number?.[0], hits.msisdn?.[0]]) ?? null;
      const bucket = byUser.get(userId) ?? {
        userId,
        displayName: null,
        phone: null,
        rides: 0,
        cancelled: 0,
        spend: 0,
        lastRoutes: [],
      };
      if (!bucket.displayName && displayName) bucket.displayName = displayName;
      if (!bucket.phone && phone) bucket.phone = phone;
      bucket.rides += 1;
      if (item.row.status === "cancelled") bucket.cancelled += 1;
      bucket.spend += Number.isFinite(item.row.clientPaid) ? Math.max(0, item.row.clientPaid) : 0;
      const route = `${item.row.pointA} -> ${item.row.pointB}`;
      if (route.trim() && !bucket.lastRoutes.includes(route)) {
        bucket.lastRoutes.unshift(route);
        if (bucket.lastRoutes.length > 3) bucket.lastRoutes = bucket.lastRoutes.slice(0, 3);
      }
      byUser.set(userId, bucket);
    }
  }

  const directoryById = new Map(directory.map((item) => [item.userId, item] as const));
  const directoryByPhoneKey = new Map(
    directory
      .map((item) => [normalizePhoneKey(item.phone ?? ""), item] as const)
      .filter(([key]) => Boolean(key)),
  );
  const byActivityPhoneKey = new Map(
    [...byUser.values()]
      .map((item) => [normalizePhoneKey(item.phone ?? ""), item] as const)
      .filter(([key]) => Boolean(key)),
  );
  const byActivityName = new Map(
    [...byUser.values()]
      .map((item) => [item.displayName?.trim().toLowerCase() ?? "", item] as const)
      .filter(([key]) => Boolean(key)),
  );
  const byActivityUserId = new Map([...byUser.values()].map((item) => [item.userId, item] as const));

  const nextLinks: Record<string, string> = { ...persistedLinks };
  const takenRemoteIds = new Set(Object.values(nextLinks));
  for (const tenantUser of tenantUsers) {
    if (nextLinks[tenantUser.id] && byActivityUserId.has(nextLinks[tenantUser.id])) continue;
    const localPhoneKey = normalizePhoneKey(tenantUser.phoneNumber ?? "");
    const localNameKey = normalizeNameKey(tenantUser.name ?? "");
    const candidates = [...byUser.values()].filter((item) => !takenRemoteIds.has(item.userId));
    const phoneHit =
      localPhoneKey && candidates.find((item) => normalizePhoneKey(item.phone ?? "") === localPhoneKey);
    if (phoneHit) {
      nextLinks[tenantUser.id] = phoneHit.userId;
      takenRemoteIds.add(phoneHit.userId);
      continue;
    }
    const nameHit =
      localNameKey &&
      candidates.find((item) => normalizeNameKey(item.displayName) === localNameKey);
    if (nameHit) {
      nextLinks[tenantUser.id] = nameHit.userId;
      takenRemoteIds.add(nameHit.userId);
    }
  }
  setTenantEmployeeLinks(auth.scope.tenantId, nextLinks);

  const items = tenantUsers
    .map((tenantUser) => {
      const userId = tenantUser.id;
      const profile = directoryById.get(userId);
      const localPhoneKey = normalizePhoneKey(tenantUser.phoneNumber ?? "");
      const localNameKey = tenantUser.name?.trim().toLowerCase() ?? "";
      const linkedRemoteId = nextLinks[userId];
      const activity =
        (linkedRemoteId ? byActivityUserId.get(linkedRemoteId) : undefined) ||
        byUser.get(userId) ||
        (localPhoneKey ? byActivityPhoneKey.get(localPhoneKey) : undefined) ||
        (localNameKey ? byActivityName.get(localNameKey) : undefined) ||
        undefined;
      const control = controls[userId] ?? {
        ordersAllowed: true,
        allowedRideClasses: [],
        updatedAt: null,
      };
      const rides = activity?.rides ?? 0;
      const spend = activity?.spend ?? 0;
      const phoneFromDirectory = profile?.phone ?? null;
      const phoneFromActivity = activity?.phone ?? null;
      const phoneKey = localPhoneKey || normalizePhoneKey(phoneFromDirectory ?? "") || normalizePhoneKey(phoneFromActivity ?? "");
      const profileByPhone = phoneKey ? directoryByPhoneKey.get(phoneKey) : null;
      const fullName =
        tenantUser.name?.trim() ||
        (phoneKey ? tenantNameByPhone.get(phoneKey)?.trim() : "") ||
        profileByPhone?.fullName?.trim() ||
        profile?.fullName?.trim() ||
        activity?.displayName?.trim() ||
        `Employee ${userId.slice(0, 8)}`;
      return {
        userId,
        fullName,
        phone: tenantUser.phoneNumber?.trim() || profile?.phone || activity?.phone || null,
        department: profile?.department ?? null,
        rides,
        cancelled: activity?.cancelled ?? 0,
        averageCheck: rides > 0 ? spend / rides : 0,
        spend,
        lastRoutes: activity?.lastRoutes ?? [],
        controls: control,
      };
    })
    .sort((a, b) => b.spend - a.spend || b.rides - a.rides || a.fullName.localeCompare(b.fullName));

  return Response.json(
    {
      ok: true,
      range,
      items,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireClientScopedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
    ordersAllowed?: unknown;
    allowedRideClasses?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ ok: false, error: "userId is required." }, { status: 400 });
  }
  const ordersAllowed = body?.ordersAllowed !== false;
  const allowedRideClasses = Array.isArray(body?.allowedRideClasses)
    ? body!.allowedRideClasses.filter((v): v is string => typeof v === "string")
    : [];

  const saved = upsertClientEmployeeControl({
    tenantId: auth.scope.tenantId,
    userId,
    ordersAllowed,
    allowedRideClasses,
  });
  return Response.json({ ok: true, item: saved }, { headers: { "Cache-Control": "no-store" } });
}
