import { b2bDashboardOrderKey, getB2BOrderDetails, pullB2BOrdersRows } from "@/lib/yango-api";
import { requireClientScopedUser } from "@/lib/server-auth";
import type { B2BDashboardOrder } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type TopBucket = {
  key: string;
  label: string;
  spend: number;
  rides: number;
};

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
  fallbackSince.setDate(now.getDate() - 90);
  const since = parseIso(input.since) ?? fallbackSince.toISOString();
  const till = parseIso(input.till) ?? now.toISOString();
  return { since, till };
}

function resolveMaxOrdersCap(): number {
  const raw = Number.parseInt(process.env.YANGO_FINANCE_SUMMARY_MAX_ORDERS ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 10000;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  const dayStart = startOfDay(date);
  dayStart.setUTCDate(dayStart.getUTCDate() - diff);
  return dayStart;
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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

function summarizeSpend(rows: B2BDashboardOrder[]) {
  const now = new Date();
  const dayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now).getTime();
  const monthStart = startOfMonth(now).getTime();
  let spendDay = 0;
  let spendWeek = 0;
  let spendMonth = 0;
  let spendTotal = 0;
  for (const row of rows) {
    const spend = Number.isFinite(row.clientPaid) ? Math.max(0, row.clientPaid) : 0;
    spendTotal += spend;
    const ts = new Date(row.scheduledAt || row.createdAt).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts >= dayStart) spendDay += spend;
    if (ts >= weekStart) spendWeek += spend;
    if (ts >= monthStart) spendMonth += spend;
  }
  return { spendDay, spendWeek, spendMonth, spendTotal };
}

export async function POST(request: Request) {
  const auth = await requireClientScopedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { since?: unknown; till?: unknown } | null;
  const range = normalizeDateRange({ since: body?.since, till: body?.till });
  const maxOrders = resolveMaxOrdersCap();
  const rows: B2BDashboardOrder[] = [];
  let cursors: Record<string, number> = {};
  let hasMore = true;
  const excludeKeys = new Set<string>();
  const errors: string[] = [];

  while (hasMore && rows.length < maxOrders) {
    const chunk = await pullB2BOrdersRows({
      since: range.since,
      till: range.till,
      startCursors: cursors,
      targetNewCount: Math.min(100, maxOrders - rows.length),
      excludeKeys,
      excludeScheduling: true,
      scope: { tokenLabel: auth.scope.tokenLabel, clientId: auth.scope.apiClientId },
    });
    for (const row of chunk.newRows) {
      rows.push(row);
      excludeKeys.add(b2bDashboardOrderKey(row));
    }
    errors.push(...chunk.errors);
    cursors = chunk.nextCursors;
    hasMore = chunk.hasMoreRemote;
    if (chunk.newRows.length === 0) break;
  }

  const { spendDay, spendWeek, spendMonth, spendTotal } = summarizeSpend(rows);
  const averageCheck = rows.length > 0 ? spendTotal / rows.length : 0;

  const topUsersMap = new Map<string, TopBucket>();
  const topDepartmentsMap = new Map<string, TopBucket>();
  const detailProbeRows = rows.slice(0, 120);

  const probeKeys = new Set([
    "user_id",
    "userid",
    "user_name",
    "username",
    "full_name",
    "fullname",
    "department",
    "department_name",
    "division",
    "cost_center",
  ]);

  for (let i = 0; i < detailProbeRows.length; i += 6) {
    const batch = detailProbeRows.slice(i, i + 6);
    const resolved = await Promise.all(
      batch.map(async (row) => {
        try {
          const details = await getB2BOrderDetails({
            tokenLabel: row.tokenLabel,
            clientId: row.clientId ?? auth.scope.apiClientId,
            orderId: row.orderId,
          });
          return { row, details };
        } catch {
          return { row, details: null };
        }
      }),
    );

    for (const item of resolved) {
      const spend = Number.isFinite(item.row.clientPaid) ? Math.max(0, item.row.clientPaid) : 0;
      if (!item.details) continue;
      const hits: Record<string, string[]> = {};
      collectStringFields(item.details.info, probeKeys, hits);
      collectStringFields(item.details.progress, probeKeys, hits);
      collectStringFields(item.details.report, probeKeys, hits);

      const userLabel =
        firstNonEmpty([
          hits.user_name?.[0],
          hits.username?.[0],
          hits.full_name?.[0],
          hits.fullname?.[0],
          hits.user_id?.[0],
          hits.userid?.[0],
        ]) ?? "Unknown user";
      const userKey = userLabel.toLowerCase();
      const prevUser = topUsersMap.get(userKey);
      topUsersMap.set(userKey, {
        key: userKey,
        label: userLabel,
        spend: (prevUser?.spend ?? 0) + spend,
        rides: (prevUser?.rides ?? 0) + 1,
      });

      const deptLabel =
        firstNonEmpty([
          hits.department?.[0],
          hits.department_name?.[0],
          hits.division?.[0],
          hits.cost_center?.[0],
        ]) ?? "Unknown department";
      const deptKey = deptLabel.toLowerCase();
      const prevDept = topDepartmentsMap.get(deptKey);
      topDepartmentsMap.set(deptKey, {
        key: deptKey,
        label: deptLabel,
        spend: (prevDept?.spend ?? 0) + spend,
        rides: (prevDept?.rides ?? 0) + 1,
      });
    }
  }

  const topUsers = [...topUsersMap.values()].sort((a, b) => b.spend - a.spend).slice(0, 8);
  const topDepartments = [...topDepartmentsMap.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  return Response.json(
    {
      ok: true,
      range,
      summary: {
        spendDay,
        spendWeek,
        spendMonth,
        spendTotal,
        averageCheck,
        rides: rows.length,
      },
      topUsers,
      topDepartments,
      rows: rows.slice(0, 250),
      errors: [...new Set(errors)].slice(0, 5),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
