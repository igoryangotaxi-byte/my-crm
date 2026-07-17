import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listSalesFiles, MAX_FILE_BYTES, uploadSalesFile } from "@/lib/sales-operation/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const files = await listSalesFiles(id);
    return Response.json({ ok: true, files }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load files." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const value = formData.get("file");
    if (value instanceof File) file = value;
  } catch {
    return Response.json({ ok: false, error: "Invalid multipart payload." }, { status: 400 });
  }

  if (!file) {
    return Response.json({ ok: false, error: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { ok: false, error: `File exceeds the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB limit.` },
      { status: 413 },
    );
  }

  try {
    const body = await file.arrayBuffer();
    const saved = await uploadSalesFile(
      id,
      { fileName: file.name, mimeType: file.type || null, body },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, file: saved }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload file.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
