import { isSupabaseConfigured } from "@/lib/supabase";
import { loadAuthStore } from "@/lib/auth-store";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { addTrackerComment } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const body = (await request.json()) as { body?: string };
    if (!body.body?.trim()) {
      return Response.json({ ok: false, error: "body is required." }, { status: 400 });
    }
    const store = await loadAuthStore();
    const staff = getPlatformStaffUserOptions(store.users);
    const comment = await addTrackerComment(
      ticketId,
      body.body,
      { userId: auth.user.id, name: auth.user.name },
      staff.map((u) => ({ id: u.id, name: u.name })),
    );
    return Response.json({ ok: true, comment }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to add comment." },
      { status: 500 },
    );
  }
}
