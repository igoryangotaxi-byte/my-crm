import { importGpTripsFromCsvBuffer } from "@/lib/gp-trips-import";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { clearYangoSupabaseMetricsCache } from "@/lib/yango-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "file is required." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importGpTripsFromCsvBuffer(buffer, { insertOnly: true });
    clearYangoSupabaseMetricsCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to import GP trips.",
      },
      { status: 500 },
    );
  }
}
