import { getRequestRideStatus } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

type StatusPayload = {
  tokenLabel?: string;
  clientId?: string;
  orderId?: string;
};

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const payload = (await request.json().catch(() => null)) as StatusPayload | null;
  const scope = getClientScope(auth.user);
  const tokenLabel = scope?.tokenLabel ?? normalizeString(payload?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(payload?.clientId);
  const orderId = normalizeString(payload?.orderId);

  if (!tokenLabel || !clientId || !orderId) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId and orderId are required." },
      { status: 400 },
    );
  }

  try {
    const result = await getRequestRideStatus({ tokenLabel, clientId, orderId });
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch ride status.",
      },
      { status: 500 },
    );
  }
}
