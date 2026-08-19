import { parse } from "csv-parse/sync";
import type { JSONContent } from "@tiptap/core";
import {
  DOCUMENTATION_MAX_TABLE_COLS,
  DOCUMENTATION_MAX_TABLE_ROWS,
} from "@/lib/sales-operation/documentation-types";

export type StringGrid = string[][];

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function paragraphNode(text: string): JSONContent {
  if (!text) return { type: "paragraph" };
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function cellNode(kind: "tableHeader" | "tableCell", text: string): JSONContent {
  return { type: kind, content: [paragraphNode(text)] };
}

/** Normalize ragged CSV/XLSX rows into a rectangular grid, capped for the editor. */
export function normalizeGrid(rows: unknown[][]): StringGrid {
  const clipped = rows.slice(0, DOCUMENTATION_MAX_TABLE_ROWS).map((row) =>
    (Array.isArray(row) ? row : []).slice(0, DOCUMENTATION_MAX_TABLE_COLS).map(cellText),
  );
  const width = Math.min(
    DOCUMENTATION_MAX_TABLE_COLS,
    clipped.reduce((max, row) => Math.max(max, row.length), 0),
  );
  if (width === 0) return [];
  return clipped
    .map((row) => {
      const next = row.slice();
      while (next.length < width) next.push("");
      return next;
    })
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

export function gridToTableNode(rows: StringGrid): JSONContent {
  const grid = normalizeGrid(rows);
  if (grid.length === 0) {
    throw new Error("The file has no table rows.");
  }
  const [header, ...body] = grid;
  const headerRow: JSONContent = {
    type: "tableRow",
    content: header.map((cell) => cellNode("tableHeader", cell)),
  };
  const bodyRows: JSONContent[] =
    body.length > 0
      ? body.map((row) => ({
          type: "tableRow",
          content: row.map((cell) => cellNode("tableCell", cell)),
        }))
      : [
          {
            type: "tableRow",
            content: header.map(() => cellNode("tableCell", "")),
          },
        ];
  return { type: "table", content: [headerRow, ...bodyRows] };
}

export function parseCsvToGrid(raw: string): StringGrid {
  const records = parse(raw.replace(/^\uFEFF/, ""), {
    relax_column_count: true,
    skip_empty_lines: true,
  }) as unknown[][];
  return normalizeGrid(records);
}
