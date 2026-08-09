/** Distinct colors per order/leg within a selected route bundle */
export const BUNDLE_LEG_COLORS = [
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
] as const;

export function colorForSequence(sequence: number): string {
  const idx = Math.max(0, sequence - 1);
  return BUNDLE_LEG_COLORS[idx % BUNDLE_LEG_COLORS.length];
}
