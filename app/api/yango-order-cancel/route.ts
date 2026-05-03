import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { cancelYangoOrder } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const scope = getClientScope(auth.user);

  const body = (await request.json().catch(() => null)) as
    | { tokenLabel?: unknown; clientId?: unknown; orderId?: unknown }
    | null;

  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);
  const orderId = normalizeString(body?.orderId);

  if (!tokenLabel || !clientId || !orderId) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId, and orderId are required." },
      { status: 400 },
    );
  }

  try {
    await cancelYangoOrder({ tokenLabel, clientId, orderId });
    revalidateTag("yango-preorders", "default");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : "Failed to cancel order.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(message || "Failed to cancel order.") },
      { status: 500 },
    );
  }
}
