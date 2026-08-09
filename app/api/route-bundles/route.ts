import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { listBundles } from "@/lib/route-bundles/repository";
import { createBundleFromPath } from "@/lib/route-bundles/repository";
import { getRouteBundleSettings } from "@/lib/route-bundles/settings";
import { createTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { enrichPreOrdersForBundling } from "@/lib/route-bundles/enrich";
import { evaluateOrderSequence } from "@/lib/route-bundles/recalculate";
import { explainBundlePath } from "@/lib/route-bundles/explain";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const bundles = await listBundles(
      status
        ? (status.split(",") as Array<
            | "suggested"
            | "reviewing"
            | "driver_contacted"
            | "accepted"
            | "rejected"
            | "active"
            | "completed"
            | "cancelled"
          >)
        : undefined,
    );
    return Response.json({ ok: true, bundles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list bundles." },
      { status: 500 },
    );
  }
}

/** Create a bundle from an explicit order id list (manual / confirm). */
export async function POST(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ ok: false, error: "GOOGLE_MAPS_API_KEY is required." }, { status: 500 });
  }

  try {
    const body = (await request.json()) as { orderIds?: string[]; status?: string };
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter(Boolean) : [];
    if (orderIds.length < 2) {
      return Response.json({ ok: false, error: "At least 2 orderIds required." }, { status: 400 });
    }
    const settings = await getRouteBundleSettings();
    const { preOrders } = await getAllYangoPreOrders();
    const enrich = await enrichPreOrdersForBundling(preOrders, settings, {
      apiKey,
      includeAssigned: true,
    });
    const byId = new Map(enrich.nodes.map((n) => [n.orderId, n]));
    const nodes = orderIds.map((id) => byId.get(id)).filter(Boolean);
    if (nodes.length !== orderIds.length) {
      return Response.json(
        { ok: false, error: "Some orders could not be enriched for routing." },
        { status: 400 },
      );
    }
    const travel = createTravelResolver({
      apiKey,
      trafficAware: settings.trafficAware,
      maxCells: settings.maxMatrixCellsPerGenerate,
    });
    const path = await evaluateOrderSequence(nodes as NonNullable<(typeof nodes)[number]>[], settings, travel);
    const explain = await explainBundlePath(path);
    const id = await createBundleFromPath({
      path,
      status: body.status === "reviewing" ? "reviewing" : "suggested",
      createdBy: auth.user.id,
      actorName: auth.user.name,
      explainText: explain,
    });
    return Response.json({ ok: true, id, health: path.health, score: path.score });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create bundle." },
      { status: 500 },
    );
  }
}
