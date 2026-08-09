import type { ScoredBundlePath } from "@/lib/route-bundles/types";

/**
 * Prefer packing more exclusive routes over a few long high-score chains.
 * Sort shorter first, then by score — then greedy exclusive take.
 */
export function packExclusivePaths(
  ranked: ScoredBundlePath[],
  maxSuggestions: number,
): ScoredBundlePath[] {
  const byCoverage = [...ranked].sort((a, b) => {
    if (a.orderIds.length !== b.orderIds.length) return a.orderIds.length - b.orderIds.length;
    return b.score - a.score;
  });
  const used = new Set<string>();
  const selected: ScoredBundlePath[] = [];
  for (const path of byCoverage) {
    if (path.orderIds.some((id) => used.has(id))) continue;
    path.orderIds.forEach((id) => used.add(id));
    selected.push(path);
    if (selected.length >= maxSuggestions) break;
  }
  // Surface higher-score among selected first in UI
  return selected.sort((a, b) => b.score - a.score);
}
