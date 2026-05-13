export const BLOCK_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#64748b",
];

export const STICKY_PALETTE = [
  "#fef08a",
  "#fde047",
  "#fbcfe8",
  "#bfdbfe",
  "#bbf7d0",
  "#e9d5ff",
];

export function normalizeHttpsUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}
