import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  createSegment,
  listSegments,
  updateSegment,
} from "@/lib/sales-operation/pipeline-config";

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
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("activeOnly") === "true";
  try {
    const segments = await listSegments(activeOnly);
    return Response.json({ ok: true, segments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list segments." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return Response.json({ ok: false, error: "Segment name is required." }, { status: 400 });
  }
  try {
    const segment = await createSegment(name);
    return Response.json({ ok: true, segment }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create segment." },
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
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    name?: unknown;
    isActive?: unknown;
    orderIndex?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return Response.json({ ok: false, error: "Segment id is required." }, { status: 400 });
  }
  try {
    const segment = await updateSegment(id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
      orderIndex: typeof body?.orderIndex === "number" ? body.orderIndex : undefined,
    });
    return Response.json({ ok: true, segment });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update segment." },
      { status: 500 },
    );
  }
}
