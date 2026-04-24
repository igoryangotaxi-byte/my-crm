import { getRequestRideApiClients } from "@/lib/yango-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const clients = await getRequestRideApiClients();
    return Response.json(
      { ok: true, clients },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load API clients.",
      },
      { status: 500 },
    );
  }
}
