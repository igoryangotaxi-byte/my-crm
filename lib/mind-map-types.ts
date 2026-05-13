import type { Edge, Node, Viewport } from "@xyflow/react";

/** Persisted React Flow state */
export type MindMapDocument = {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
};

export type MindMapRow = {
  id: string;
  title: string;
  document: MindMapDocument;
  created_by: string;
  updated_at: string;
  created_at: string;
};

export type DefaultBlockData = { label: string; color: string };
export type StickyBlockData = { label: string; stickyColor: string };
export type LinkBlockData = { label: string; url: string };
export type FileBlockData = {
  label: string;
  path: string;
  name: string;
  mime: string;
  size: number;
};
