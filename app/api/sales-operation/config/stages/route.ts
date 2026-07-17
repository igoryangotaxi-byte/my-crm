import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  listPipelineStages,
  reorderPipelineStages,
  upsertPipelineStage,
} from "@/lib/sales-operation/pipeline-config";
import type { PipelineStage } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Reading stages is needed to render the board — allow any pipeline viewer.
  const authPipeline = await requireSalesOperationPage(request, "salesPipeline");
  const auth = authPipeline.ok
    ? authPipeline
    : await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const stages = await listPipelineStages();
    return Response.json({ ok: true, stages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list stages." },
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
  const body = (await request.json().catch(() => null)) as Partial<PipelineStage> | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!key || !label) {
    return Response.json({ ok: false, error: "Stage key and label are required." }, { status: 400 });
  }
  try {
    const stage = await upsertPipelineStage({
      key,
      label,
      orderIndex: typeof body?.orderIndex === "number" ? body.orderIndex : 0,
      probability: typeof body?.probability === "number" ? body.probability : 0,
      isWon: body?.isWon === true,
      isLost: body?.isLost === true,
      isTerminal: body?.isTerminal === true,
      isActive: body?.isActive !== false,
      color: typeof body?.color === "string" && body.color.trim() ? body.color : null,
    });
    return Response.json({ ok: true, stage });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save stage." },
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
  const body = (await request.json().catch(() => null)) as { orderedKeys?: unknown } | null;
  const orderedKeys = Array.isArray(body?.orderedKeys)
    ? body.orderedKeys.filter((value): value is string => typeof value === "string")
    : [];
  if (orderedKeys.length === 0) {
    return Response.json({ ok: false, error: "orderedKeys is required." }, { status: 400 });
  }
  try {
    await reorderPipelineStages(orderedKeys);
    const stages = await listPipelineStages();
    return Response.json({ ok: true, stages });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reorder stages." },
      { status: 500 },
    );
  }
}
