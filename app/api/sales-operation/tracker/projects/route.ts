import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import { createTrackerProject, listTrackerProjects } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  try {
    const projects = await listTrackerProjects({ includeArchived });
    return Response.json({ ok: true, projects }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load projects." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("editBoard", auth.user.role)) return trackerForbiddenResponse("editBoard");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const body = (await request.json()) as { name?: string; description?: string | null };
    if (!body.name?.trim()) {
      return Response.json({ ok: false, error: "Name is required." }, { status: 400 });
    }
    const project = await createTrackerProject(
      { name: body.name, description: body.description ?? null },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create project." },
      { status: 500 },
    );
  }
}
