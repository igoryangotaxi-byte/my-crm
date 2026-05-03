import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { getRequestRideApiClients } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const scope = getClientScope(auth.user);
    const clients = await getRequestRideApiClients(
      scope ? { tokenLabel: scope.tokenLabel, clientId: scope.apiClientId } : undefined,
    );
    return Response.json(
      { ok: true, clients },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[request-rides-clients]", error);
    }
    const msg = error instanceof Error ? error.message.trim() : "Failed to load clients.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(msg || "Failed to load clients.") },
      { status: 500 },
    );
  }
}
