import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { listMoneImports } from "@/lib/driver-price-comparison/mone-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const imports = await listMoneImports();
    return Response.json({ ok: true, imports }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to list imports.",
      },
      { status: 500 },
    );
  }
}
