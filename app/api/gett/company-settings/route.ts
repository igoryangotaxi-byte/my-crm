import { getGettCompanySettings } from "@/lib/gett-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  try {
    const settings = await getGettCompanySettings(force);
    if (!settings) {
      return Response.json(
        { ok: false, error: "Company settings are only available for Gett Business API flavor." },
        { status: 400 },
      );
    }
    return Response.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load company settings." },
      { status: 500 },
    );
  }
}
