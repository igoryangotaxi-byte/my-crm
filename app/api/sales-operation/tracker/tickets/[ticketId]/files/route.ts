import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  deleteTrackerFile,
  listTrackerFiles,
  MAX_TRACKER_FILE_BYTES,
  uploadTrackerFile,
} from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const files = await listTrackerFiles(ticketId);
    return Response.json({ ok: true, files }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list files." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "file is required." }, { status: 400 });
    }
    if (file.size > MAX_TRACKER_FILE_BYTES) {
      return Response.json({ ok: false, error: "File too large (max 25MB)." }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    const uploaded = await uploadTrackerFile(
      ticketId,
      { fileName: file.name, mimeType: file.type || null, body: buffer },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, file: uploaded }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to upload file." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  await ctx.params;
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId");
  if (!fileId) {
    return Response.json({ ok: false, error: "fileId is required." }, { status: 400 });
  }
  try {
    await deleteTrackerFile(fileId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete file." },
      { status: 500 },
    );
  }
}
