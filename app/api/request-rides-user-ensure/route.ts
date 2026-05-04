import { ensureRequestRideUserByPhone } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type EnsurePayload = {
  tokenLabel?: string;
  clientId?: string;
  phoneNumber?: string;
  fullName?: string;
  costCenterId?: string;
};

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as EnsurePayload | null;
  const scope = getClientScope(auth.user);
  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);
  const phoneNumber = normalizeString(body?.phoneNumber);
  const fullName = normalizeString(body?.fullName);
  const costCenterId = normalizeString(body?.costCenterId);

  if (!tokenLabel || !clientId || !phoneNumber) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId and phoneNumber are required." },
      { status: 400 },
    );
  }

  try {
    const result = await ensureRequestRideUserByPhone({
      tokenLabel,
      clientId,
      phoneNumber,
      fullName: fullName || null,
      costCenterId: costCenterId || null,
    });
    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error ?? "Could not create employee in Yango.",
          attempts: result.attempts,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      {
        ok: true,
        created: result.created,
        user: result.user
          ? {
              userId: result.user.userId,
              phone: result.user.phone,
              fullName: result.user.fullName,
              source: result.user.source,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create employee in Yango.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
