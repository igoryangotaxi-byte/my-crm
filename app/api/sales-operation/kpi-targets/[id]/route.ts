import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deleteKpiTarget } from "@/lib/sales-operation/kpi-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return Response.json({ ok: false, error: "Missing target id." }, { status: 400 });
  }

  try {
    await deleteKpiTarget(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete target." },
      { status: 500 },
    );
  }
}
