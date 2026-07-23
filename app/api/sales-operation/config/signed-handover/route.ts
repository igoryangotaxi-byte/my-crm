import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  getSignedHandoverSettings,
  updateSignedHandoverSettings,
} from "@/lib/sales-operation/signed-handover";
import { listTrackerProjects } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authPipeline = await requireSalesOperationPage(request, "salesPipeline");
  const auth = authPipeline.ok
    ? authPipeline
    : await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const settings = await getSignedHandoverSettings();
    let projects: Awaited<ReturnType<typeof listTrackerProjects>> = [];
    try {
      projects = await listTrackerProjects({ includeArchived: false });
    } catch (error) {
      console.error("signed-handover settings: listTrackerProjects failed:", error);
    }
    return Response.json(
      { ok: true, settings, projects },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load signed handover settings.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      defaultAccountManagerUserId?: string | null;
      defaultAccountManagerName?: string | null;
      trackerProjectId?: string | null;
    } | null;
    if (!body) {
      return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
    }
    const settings = await updateSignedHandoverSettings({
      defaultAccountManagerUserId: body.defaultAccountManagerUserId,
      defaultAccountManagerName: body.defaultAccountManagerName,
      trackerProjectId: body.trackerProjectId,
    });
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save signed handover settings.",
      },
      { status: 500 },
    );
  }
}
