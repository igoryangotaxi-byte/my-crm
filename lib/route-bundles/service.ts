import { enrichPreOrdersForBundling } from "@/lib/route-bundles/enrich";
import { explainBundlePath } from "@/lib/route-bundles/explain";
import { generateBundlePaths } from "@/lib/route-bundles/generator";
import { createTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { scanInsertionOpportunities } from "@/lib/route-bundles/opportunities";
import { ensurePathPolylines } from "@/lib/route-bundles/polylines";
import {
  createBundleFromPath,
  deleteSuggestedBundles,
  listBundles,
} from "@/lib/route-bundles/repository";
import { getRouteBundleSettings } from "@/lib/route-bundles/settings";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export async function runBundleGeneration(actor: {
  userId: string | null;
  name: string | null;
}): Promise<{
  created: number;
  warnings: string[];
  skippedMissingCoords: number;
  opportunities: number;
}> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is required for Route Bundles.");
  }

  const settings = await getRouteBundleSettings();
  const { preOrders } = await getAllYangoPreOrders();
  const enrich = await enrichPreOrdersForBundling(preOrders, settings, { apiKey });
  const travel = createTravelResolver({
    apiKey,
    trafficAware: settings.trafficAware,
    maxCells: settings.maxMatrixCellsPerGenerate,
  });

  const { paths, warnings } = await generateBundlePaths(enrich.nodes, settings, travel);
  await deleteSuggestedBundles();

  let created = 0;
  for (const path of paths) {
    const withRoads = await ensurePathPolylines(path, travel);
    const explain = await explainBundlePath(withRoads);
    await createBundleFromPath({
      path: withRoads,
      status: "suggested",
      createdBy: actor.userId,
      actorName: actor.name,
      explainText: explain,
    });
    created += 1;
  }

  const activeBundles = await listBundles([
    "suggested",
    "reviewing",
    "driver_contacted",
    "accepted",
  ]);
  const opportunities = await scanInsertionOpportunities({
    bundles: activeBundles,
    pool: enrich.nodes,
    settings,
    travel,
  });

  return {
    created,
    warnings,
    skippedMissingCoords: enrich.skippedMissingCoords,
    opportunities,
  };
}
