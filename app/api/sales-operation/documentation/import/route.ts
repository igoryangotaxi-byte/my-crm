import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { documentationExtensions } from "@/lib/sales-operation/documentation-schema";
import { gridToTableNode, parseCsvToGrid } from "@/lib/sales-operation/documentation-import";
import { DOCUMENTATION_MAX_IMPORT_BYTES } from "@/lib/sales-operation/documentation-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workbookToGrid(buffer: Buffer): string[][] {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = book.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = book.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];
  return rows as string[][];
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesDocumentation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (file.size > DOCUMENTATION_MAX_IMPORT_BYTES) {
      return Response.json({ ok: false, error: "File is larger than 5 MB." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (name.endsWith(".docx")) {
      const { value: html } = await mammoth.convertToHtml({ buffer });
      const doc = generateJSON(html || "<p></p>", documentationExtensions()) as JSONContent;
      return Response.json({ ok: true, kind: "doc", content: doc });
    }

    const grid = name.endsWith(".csv")
      ? parseCsvToGrid(buffer.toString("utf8"))
      : name.endsWith(".xlsx") || name.endsWith(".xls")
        ? workbookToGrid(buffer)
        : null;
    if (!grid) {
      return Response.json(
        { ok: false, error: "Supported files: CSV, XLSX, XLS, DOCX." },
        { status: 400 },
      );
    }
    const table = gridToTableNode(grid);
    return Response.json({ ok: true, kind: "table", content: table });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
