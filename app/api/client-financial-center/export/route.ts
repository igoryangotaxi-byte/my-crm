import * as XLSX from "xlsx";
import { b2bDashboardOrderKey, pullB2BOrdersRows } from "@/lib/yango-api";
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
  fallbackSince.setDate(now.getDate() - 90);
  const since = parseIso(input.since) ?? fallbackSince.toISOString();
  const till = parseIso(input.till) ?? now.toISOString();
  return { since, till };
}

function toRows(rows: B2BDashboardOrder[]) {
  return rows.map((row) => ({
    order_id: row.orderId,
    created_at: row.createdAt,
    scheduled_at: row.scheduledAt,
    status: row.status,
    status_raw: row.statusRaw,
    client_name: row.clientName,
    token_label: row.tokenLabel,
    client_id: row.clientId ?? "",
    point_a: row.pointA,
    point_b: row.pointB,
    client_paid: row.clientPaid,
    driver_received: row.driverReceived,
    decoupling: row.decoupling,
  }));
}

export async function POST(request: Request) {
  const auth = await requireClientScopedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as {
    since?: unknown;
    till?: unknown;
    format?: unknown;
  } | null;
  const range = normalizeDateRange({ since: body?.since, till: body?.till });
  const format = body?.format === "xlsx" ? "xlsx" : "csv";

  const maxOrders = 2000;
  const rows: B2BDashboardOrder[] = [];
  let cursors: Record<string, number> = {};
  let hasMore = true;
  const excludeKeys = new Set<string>();

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
    cursors = chunk.nextCursors;
    hasMore = chunk.hasMoreRemote;
    if (chunk.newRows.length === 0) break;
  }

  const tabularRows = toRows(rows);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(tabularRows);
    XLSX.utils.book_append_sheet(wb, ws, "Financial Center");
    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(out, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="financial-center-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(tabularRows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financial-center-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
