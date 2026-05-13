import type { MindMapDocument } from "@/lib/mind-map-types";

export function createEmptyMindMapDocument(): MindMapDocument {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    nodes: [
      {
        id,
        type: "mindDefault",
        position: { x: 260, y: 140 },
        data: { label: "Central topic", color: "#6366f1" },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function normalizeMindMapDocument(raw: unknown): MindMapDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const nodes = obj.nodes;
  const edges = obj.edges;
  const viewport = obj.viewport;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  const vp =
    viewport &&
    typeof viewport === "object" &&
    "x" in viewport &&
    "y" in viewport &&
    "zoom" in viewport
      ? (viewport as MindMapDocument["viewport"])
      : { x: 0, y: 0, zoom: 1 };
  return {
    nodes: nodes as MindMapDocument["nodes"],
    edges: edges as MindMapDocument["edges"],
    viewport: vp,
  };
}
