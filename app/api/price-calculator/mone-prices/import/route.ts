import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  commitMoneImport,
  parseUploadBuffer,
} from "@/lib/driver-price-comparison/mone-import";

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
  const mappingRaw = formData?.get("columnMapping");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "file is required." }, { status: 400 });
  }

  let columnMapping: Record<string, string | null> = {};
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    columnMapping = JSON.parse(mappingRaw) as Record<string, string | null>;
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseUploadBuffer(file.name, buffer);
    const result = await commitMoneImport({
      fileName: parsed.fileName,
      rows: parsed.rows,
      columnMapping,
      uploadedBy: auth.user.email ?? auth.user.name ?? null,
      createdByUserId: auth.user.id,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to import mone prices.",
      },
      { status: 500 },
    );
  }
}
