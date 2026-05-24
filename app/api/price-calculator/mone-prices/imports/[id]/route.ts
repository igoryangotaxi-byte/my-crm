import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { getMoneImportDetail } from "@/lib/driver-price-comparison/mone-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const detail = await getMoneImportDetail(id);
    if (!detail) {
      return Response.json({ ok: false, error: "Import not found." }, { status: 404 });
    }
    return Response.json({ ok: true, ...detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load import detail.",
      },
      { status: 500 },
    );
  }
}
