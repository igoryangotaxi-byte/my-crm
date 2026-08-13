/** YCDS chart + status tokens mapped to the existing Yango palette. */

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export const CHART_HEX = {
  chart1: "#FF2D2D",
  chart2: "#C70F1F",
  chart3: "#2563EB",
  chart4: "#059669",
  chart5: "#D97706",
  chart6: "#7C3AED",
  muted: "#6B7280",
  grid: "#EEF0F3",
  border: "#E9EBF0",
  text: "#14161A",
} as const;

export const PIPELINE_STAGE_HEX: Record<string, string> = {
  new: "#2563EB",
  in_progress: "#7C3AED",
  proposal_sent: "#D97706",
  negotiation: "#DC2626",
  signed: "#059669",
  rejected: "#64748B",
};
