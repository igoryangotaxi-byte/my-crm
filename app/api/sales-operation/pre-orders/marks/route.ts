import {
  isPreOrderOperatorContactStatus,
  listPreOrderOperatorMarks,
  upsertPreOrderOperatorMark,
} from "@/lib/preorders/operator-marks";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "preOrders");
  if (!auth.ok) return auth.response;

  try {
    const marks = await listPreOrderOperatorMarks();
    return Response.json({ ok: true, marks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load marks." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "preOrders");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      tokenLabel?: string;
      clientId?: string;
      orderId?: string;
      status?: string;
      note?: string | null;
    };

    const tokenLabel = typeof body.tokenLabel === "string" ? body.tokenLabel.trim() : "";
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!tokenLabel || !clientId || !orderId) {
      return Response.json(
        { ok: false, error: "tokenLabel, clientId and orderId are required." },
        { status: 400 },
      );
    }
    if (!isPreOrderOperatorContactStatus(body.status)) {
      return Response.json({ ok: false, error: "Invalid contact status." }, { status: 400 });
    }

    const mark = await upsertPreOrderOperatorMark({
      tokenLabel,
      clientId,
      orderId,
      status: body.status,
      markedByUserId: auth.user.id,
      markedByName: auth.user.name || auth.user.email || auth.user.id,
      note: body.note ?? null,
    });

    return Response.json({ ok: true, mark }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save mark." },
      { status: 500 },
    );
  }
}
