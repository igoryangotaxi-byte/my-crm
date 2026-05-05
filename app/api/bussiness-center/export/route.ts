import * as XLSX from "xlsx";
import {
  buildBussinessCenterPayload,
  normalizeDateRange,
} from "@/lib/bussiness-center";
import {
  loadBussinessCenterCache,
  saveBussinessCenterCache,
} from "@/lib/bussiness-center-cache";
import { getRequestRideApiClients } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";
import type { B2BDashboardOrder } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function resolveMaxOrdersCap(): number {
  const raw = Number.parseInt(process.env.YANGO_FINANCE_EXPORT_MAX_ORDERS ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 20000;
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
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const scope = getClientScope(auth.user);

  const body = (await request.json().catch(() => null)) as {
    tokenLabel?: unknown;
    clientId?: unknown;
    since?: unknown;
    till?: unknown;
    format?: unknown;
  } | null;

  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);
  if (!tokenLabel || !clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId are required." },
      { status: 400 },
    );
  }
  if (!scope) {
    const allowed = await getRequestRideApiClients().catch(() => []);
    const hasAccess = allowed.some(
      (item) => item.tokenLabel === tokenLabel && item.clientId === clientId,
    );
    if (!hasAccess) {
      return Response.json(
        { ok: false, error: "Selected client is not available for your account." },
        { status: 403 },
      );
    }
  }

  const range = normalizeDateRange({ since: body?.since, till: body?.till });
  const format = body?.format === "xlsx" ? "xlsx" : "csv";
  const cacheInput = { tokenLabel, clientId, since: range.since, till: range.till };

  const cached = await loadBussinessCenterCache(cacheInput);
  const payload =
    cached ??
    (await buildBussinessCenterPayload({
      tokenLabel,
      clientId,
      since: range.since,
      till: range.till,
      maxOrders: resolveMaxOrdersCap(),
    }));
  if (!cached) {
    await saveBussinessCenterCache(cacheInput, payload);
  }

  const tabularRows = toRows(payload.rows);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(tabularRows);
    XLSX.utils.book_append_sheet(wb, ws, "Bussiness Center");
    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(out, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bussiness-center-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(tabularRows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bussiness-center-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
