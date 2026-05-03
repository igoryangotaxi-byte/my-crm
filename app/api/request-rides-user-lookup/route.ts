import { resolveRequestRideUserByPhone } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LookupPayload = {
  tokenLabel?: string;
  clientId?: string;
  phoneNumber?: string;
};

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as LookupPayload | null;
  const scope = getClientScope(auth.user);
  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);
  const phoneNumber = normalizeString(body?.phoneNumber);

  if (!tokenLabel || !clientId || !phoneNumber) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId and phoneNumber are required." },
      { status: 400 },
    );
  }

  try {
    const match = await resolveRequestRideUserByPhone({
      tokenLabel,
      clientId,
      phoneNumber,
    });
    return Response.json(
      {
        ok: true,
        found: Boolean(match?.userId),
        userId: match?.userId ?? null,
        fullName: match?.fullName ?? null,
        phone: match?.phone ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to lookup user by phone.",
      },
      { status: 500 },
    );
  }
}
