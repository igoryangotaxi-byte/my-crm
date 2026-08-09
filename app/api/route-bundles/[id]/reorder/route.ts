import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { explainBundlePath } from "@/lib/route-bundles/explain";
import { createTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { evaluateOrderSequence, nodesFromBundleItems } from "@/lib/route-bundles/recalculate";
import {
  applyPathToBundle,
  getBundle,
  logBundleEvent,
} from "@/lib/route-bundles/repository";
import { getRouteBundleSettings } from "@/lib/route-bundles/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ ok: false, error: "GOOGLE_MAPS_API_KEY is required." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as { orderIds?: string[] };
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds : [];
    const bundle = await getBundle(id);
    if (!bundle) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    if (orderIds.length !== bundle.items.length) {
      return Response.json({ ok: false, error: "orderIds must include all current items." }, { status: 400 });
    }
    const byId = new Map(bundle.items.map((i) => [i.orderId, i]));
    const ordered = orderIds.map((oid) => byId.get(oid)).filter(Boolean);
    if (ordered.length !== orderIds.length) {
      return Response.json({ ok: false, error: "Unknown order in reorder list." }, { status: 400 });
    }
    const settings = await getRouteBundleSettings();
    const nodes = nodesFromBundleItems(
      ordered.map((item, sequence) => ({ ...item!, sequence: sequence + 1 })),
    );
    // For MVP: force chronological after reorder attempt if unsafe? Still evaluate as given
    // but prefer scheduled order when user reorders wrongly — evaluate user's sequence as-is using scheduled pickups
    const travel = createTravelResolver({
      apiKey,
      trafficAware: settings.trafficAware,
      maxCells: settings.maxMatrixCellsPerGenerate,
    });
    const path = await evaluateOrderSequence(nodes, settings, travel);
    const explain = await explainBundlePath(path);
    await applyPathToBundle(id, path, "edit", auth.user.id, explain);
    await logBundleEvent({
      bundleId: id,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      action: "reordered",
      payload: { orderIds },
    });
    const updated = await getBundle(id);
    return Response.json({ ok: true, bundle: updated, health: path.health });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reorder." },
      { status: 500 },
    );
  }
}
