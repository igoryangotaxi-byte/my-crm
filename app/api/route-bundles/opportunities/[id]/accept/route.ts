import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { enrichPreOrdersForBundling } from "@/lib/route-bundles/enrich";
import { explainBundlePath } from "@/lib/route-bundles/explain";
import { createTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { evaluateOrderSequence } from "@/lib/route-bundles/recalculate";
import {
  applyPathToBundle,
  getBundle,
  getOpportunity,
  logBundleEvent,
  setOpportunityStatus,
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
    const opp = await getOpportunity(id);
    if (!opp || opp.status !== "open") {
      return Response.json({ ok: false, error: "Opportunity not found." }, { status: 404 });
    }
    const bundle = await getBundle(opp.targetBundleId);
    if (!bundle) return Response.json({ ok: false, error: "Bundle not found." }, { status: 404 });

    const settings = await getRouteBundleSettings();
    const { preOrders } = await getAllYangoPreOrders();
    const enrich = await enrichPreOrdersForBundling(preOrders, settings, {
      apiKey,
      includeAssigned: true,
    });
    const byId = new Map(enrich.nodes.map((n) => [n.orderId, n]));
    const nodes = opp.proposedSequence.map((oid) => byId.get(oid)).filter(Boolean);
    if (nodes.length !== opp.proposedSequence.length) {
      return Response.json(
        { ok: false, error: "Proposed sequence is no longer available." },
        { status: 400 },
      );
    }
    const travel = createTravelResolver({
      apiKey,
      trafficAware: settings.trafficAware,
      maxCells: settings.maxMatrixCellsPerGenerate,
    });
    const path = await evaluateOrderSequence(
      nodes as NonNullable<(typeof nodes)[number]>[],
      settings,
      travel,
    );
    const explain = await explainBundlePath(path);
    await applyPathToBundle(bundle.id, path, "opportunity", auth.user.id, explain);
    await setOpportunityStatus(id, "accepted");
    await logBundleEvent({
      bundleId: bundle.id,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      action: "opportunity_accepted",
      payload: { opportunityId: id, orderId: opp.candidateOrderId },
    });
    const updated = await getBundle(bundle.id);
    return Response.json({ ok: true, bundle: updated });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Accept failed." },
      { status: 500 },
    );
  }
}
