import { listYangoCostCenters } from "@/lib/yango-api";
import { requireClientScopedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireClientScopedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const items = await listYangoCostCenters({
      tokenLabel: auth.scope.tokenLabel,
      clientId: auth.scope.apiClientId,
    });
    return Response.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load cost centers.",
      },
      { status: 500 },
    );
  }
}
