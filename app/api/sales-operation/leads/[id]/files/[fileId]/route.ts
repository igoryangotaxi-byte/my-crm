import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deleteSalesFile } from "@/lib/sales-operation/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { fileId } = await context.params;
  try {
    await deleteSalesFile(fileId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete file.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
