import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { markNotificationsRead } from "@/lib/sales-operation/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
    all?: boolean;
  } | null;

  try {
    await markNotificationsRead(auth.user.id, {
      ids: Array.isArray(body?.ids) ? body?.ids : undefined,
      all: Boolean(body?.all),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update notifications." },
      { status: 500 },
    );
  }
}
