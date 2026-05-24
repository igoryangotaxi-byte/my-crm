import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  buildParseResponse,
  estimateMoneImportMatches,
  parseUploadBuffer,
} from "@/lib/driver-price-comparison/mone-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const parsed = parseUploadBuffer(file.name, buffer);
    const response = buildParseResponse(parsed);
    const matchStats = await estimateMoneImportMatches(parsed.rows, response.suggestedMapping);
    return Response.json(
      { ...response, ...matchStats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to parse upload.",
      },
      { status: 400 },
    );
  }
}
