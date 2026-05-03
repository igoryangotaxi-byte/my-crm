import { getFleetApiPartners } from "@/lib/fleet-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const partners = await getFleetApiPartners();
  return Response.json(
    { ok: true, partners },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
