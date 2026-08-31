import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { getCallCenterUserSettings } from "@/lib/call-center/repository";
import { listCallCenterCalls } from "@/lib/call-center/calls-repository";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesCallCenter");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope")?.trim() || "mine";
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const isAdmin = auth.user.role === "Admin";
  const showAll = scope === "all" && isAdmin;

  try {
    const settings = await getCallCenterUserSettings(auth.user.id);
    const calls = await listCallCenterCalls({
      all: showAll,
      crmUserId: showAll ? null : auth.user.id,
      agentExtension: showAll ? null : settings?.extension ?? null,
      limit,
    });
    return Response.json({ ok: true, calls });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load calls.",
      },
      { status: 500 },
    );
  }
}
