import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { countUnreadNotifications, listNotifications } from "@/lib/sales-operation/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 30;

  try {
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(auth.user.id, { unreadOnly, limit }),
      countUnreadNotifications(auth.user.id),
    ]);
    return Response.json(
      { ok: true, notifications, unreadCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load notifications." },
      { status: 500 },
    );
  }
}
