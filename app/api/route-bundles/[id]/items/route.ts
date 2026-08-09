import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { enrichPreOrdersForBundling } from "@/lib/route-bundles/enrich";
import { explainBundlePath } from "@/lib/route-bundles/explain";
import { createTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { evaluateOrderSequence, nodesFromBundleItems } from "@/lib/route-bundles/recalculate";
import {
  applyPathToBundle,
  getBundle,
  logBundleEvent,
} from "@/lib/route-bundles/repository";
import { getRouteBundleSettings } from "@/lib/route-bundles/settings";
import { getAllYangoPreOrders } from "@/lib/yango-api";

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
    const body = (await request.json()) as { orderId?: string };
    const orderId = body.orderId?.trim();
    if (!orderId) return Response.json({ ok: false, error: "orderId required." }, { status: 400 });

    const bundle = await getBundle(id);
    if (!bundle) return Response.json({ ok: false, error: "Not found." }, { status: 404 });

    const settings = await getRouteBundleSettings();
    if (bundle.items.length >= settings.maxOrdersPerBundle) {
      return Response.json({ ok: false, error: "Bundle already at max orders." }, { status: 400 });
    }

    const { preOrders } = await getAllYangoPreOrders();
    const enrich = await enrichPreOrdersForBundling(preOrders, settings, {
      apiKey,
      includeAssigned: true,
    });
    const candidate = enrich.nodes.find((n) => n.orderId === orderId);
    if (!candidate) {
      return Response.json({ ok: false, error: "Order not available for bundling." }, { status: 400 });
    }

    const current = nodesFromBundleItems(bundle.items);
    const merged = [...current, candidate].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    );
    const travel = createTravelResolver({
      apiKey,
      trafficAware: settings.trafficAware,
      maxCells: settings.maxMatrixCellsPerGenerate,
    });
    const path = await evaluateOrderSequence(merged, settings, travel);
    const explain = await explainBundlePath(path);
    await applyPathToBundle(id, path, "edit", auth.user.id, explain);
    await logBundleEvent({
      bundleId: id,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      action: "item_added",
      payload: { orderId },
    });
    const updated = await getBundle(id);
    return Response.json({ ok: true, bundle: updated, health: path.health });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to add order." },
      { status: 500 },
    );
  }
}
