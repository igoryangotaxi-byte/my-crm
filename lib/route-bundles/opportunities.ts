import { evaluateOrderSequence } from "@/lib/route-bundles/recalculate";
import type { TravelResolver } from "@/lib/route-bundles/matrix-cache";
import { upsertOpportunity } from "@/lib/route-bundles/repository";
import type {
  EnrichedPreOrderNode,
  RouteBundle,
  RouteBundleSettings,
} from "@/lib/route-bundles/types";

/**
 * Try inserting a candidate into each slot of an existing bundle sequence.
 * Persist the best feasible opportunity.
 */
export async function scanInsertionOpportunities(input: {
  bundles: RouteBundle[];
  pool: EnrichedPreOrderNode[];
  settings: RouteBundleSettings;
  travel: TravelResolver;
}): Promise<number> {
  const usedOrderIds = new Set(input.bundles.flatMap((b) => b.items.map((i) => i.orderId)));
  const pool = input.pool.filter((n) => !usedOrderIds.has(n.orderId));
  let created = 0;

  const editable = input.bundles.filter((b) => {
    if (["suggested", "reviewing", "driver_contacted"].includes(b.status)) return true;
    if (b.status === "accepted" && input.settings.allowInsertIntoAccepted) return true;
    return false;
  });

  for (const bundle of editable) {
    const currentNodes: EnrichedPreOrderNode[] = bundle.items
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((item) => ({
        orderId: item.orderId,
        tokenLabel: item.tokenLabel,
        clientId: item.clientId,
        clientName: item.clientName,
        pickupAddress: item.pickupAddress,
        dropoffAddress: item.dropoffAddress,
        pickup: { lat: item.pickupLat, lon: item.pickupLon },
        dropoff: { lat: item.dropoffLat, lon: item.dropoffLon },
        scheduledAt: new Date(item.scheduledAt),
        serviceDurationSec: item.serviceDurationSec,
        serviceDurationConfidence:
          item.serviceDurationConfidence === "routed" ? "routed" : "estimated",
      }));

    if (currentNodes.length >= input.settings.maxOrdersPerBundle) continue;
    const token = currentNodes[0]?.tokenLabel;
    if (!token) continue;

    for (const candidate of pool.filter((p) => p.tokenLabel === token)) {
      if (input.travel.budgetExceeded()) return created;
      let best: {
        sequence: string[];
        scoreDelta: number;
        minBufferSec: number;
        deltaEmptyM: number;
        deltaEmptySec: number;
      } | null = null;

      for (let slot = 0; slot <= currentNodes.length; slot += 1) {
        const trial = [...currentNodes.slice(0, slot), candidate, ...currentNodes.slice(slot)];
        // Keep chronological pickup order for MVP safety
        const sorted = trial.slice().sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
        const seqKey = sorted.map((n) => n.orderId).join(">");
        if (seqKey === currentNodes.map((n) => n.orderId).join(">")) continue;
        try {
          const scored = await evaluateOrderSequence(sorted, input.settings, input.travel);
          if (scored.health === "conflict") continue;
          const scoreDelta = scored.score - bundle.score;
          const deltaEmptyM = scored.emptyDriveM - bundle.emptyDriveM;
          const deltaEmptySec = scored.emptyDriveSec - bundle.emptyDriveSec;
          if (!best || scoreDelta > best.scoreDelta) {
            best = {
              sequence: scored.orderIds,
              scoreDelta,
              minBufferSec: scored.minBufferSec,
              deltaEmptyM,
              deltaEmptySec,
            };
          }
        } catch {
          // skip slot
        }
      }

      if (best && best.scoreDelta > -5) {
        await upsertOpportunity({
          targetBundleId: bundle.id,
          candidateOrderId: candidate.orderId,
          candidateTokenLabel: candidate.tokenLabel,
          proposedSequence: best.sequence,
          deltaEmptyDriveM: best.deltaEmptyM,
          deltaEmptyDriveSec: best.deltaEmptySec,
          minBufferSec: best.minBufferSec,
          scoreDelta: best.scoreDelta,
          summary: `Order #${candidate.orderId} fits with ${Math.round(best.minBufferSec / 60)} min buffer (${best.scoreDelta >= 0 ? "+" : ""}${best.scoreDelta.toFixed(0)} score).`,
        });
        created += 1;
      }
    }
  }

  return created;
}
