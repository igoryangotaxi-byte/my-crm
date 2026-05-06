import { getGettOrder } from "@/lib/gett-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) {
    return Response.json({ ok: false, error: "orderId is required." }, { status: 400 });
  }
  try {
    const result = await getGettOrder(orderId);
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch Gett order status." },
      { status: 500 },
    );
  }
}
