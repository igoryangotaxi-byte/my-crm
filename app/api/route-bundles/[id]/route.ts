import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { createTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { snapshotNeedsRoadGeometry, ensurePathPolylines } from "@/lib/route-bundles/polylines";
import {
  buildSnapshotFromPath,
  evaluateOrderSequence,
  nodesFromBundleItems,
} from "@/lib/route-bundles/recalculate";
import { getBundle, listBundleEvents, saveSnapshot } from "@/lib/route-bundles/repository";
import { getRouteBundleSettings } from "@/lib/route-bundles/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    let bundle = await getBundle(id);
    if (!bundle) return Response.json({ ok: false, error: "Not found." }, { status: 404 });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (apiKey && snapshotNeedsRoadGeometry(bundle) && bundle.items.length >= 1) {
      try {
        const settings = await getRouteBundleSettings();
        const travel = createTravelResolver({
          apiKey,
          trafficAware: settings.trafficAware,
          maxCells: Math.max(settings.maxMatrixCellsPerGenerate, 200),
        });
        const nodes = nodesFromBundleItems(bundle.items);
        const scored = await evaluateOrderSequence(nodes, settings, travel);
        const withRoads = await ensurePathPolylines(scored, travel);
        await saveSnapshot(id, "geometry_enrich", buildSnapshotFromPath(withRoads));
        bundle = (await getBundle(id)) ?? bundle;
      } catch (error) {
        console.warn("route-bundles geometry enrich:", error);
      }
    }

    const events = await listBundleEvents(id);
    return Response.json({ ok: true, bundle, events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load bundle." },
      { status: 500 },
    );
  }
}
