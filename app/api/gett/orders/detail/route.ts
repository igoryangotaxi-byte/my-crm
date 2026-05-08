import { fetchGettOrderJson } from "@/lib/gett-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const orderId = new URL(request.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) {
    return Response.json({ ok: false, error: "orderId query parameter is required." }, { status: 400 });
  }
  try {
    const raw = await fetchGettOrderJson(orderId);
    return Response.json({ ok: true, orderId, raw }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch order detail." },
      { status: 500 },
    );
  }
}
