import * as XLSX from "xlsx";

/** Columns A/B accept UTF-8 text (English, Russian, Hebrew); geocoding picks language by script server-side. */

export type ParsedTranscriptTripRow = {
  rowNumber: number;
  addressA: string;
  addressB: string;
  tripAt: Date;
  /** Human-readable trip datetime from source file (kept for UI/export to avoid UTC shifts). */
  tripDisplay: string;
};

export type ParseTranscriptWorkbookResult = {
  rows: ParsedTranscriptTripRow[];
  errors: string[];
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/^\ufeff/, "").trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return "";
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 24 * 60 * 60 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLocaleDateString(text: string): Date | null {
  const m = text.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const hours = m[4] ? Number(m[4]) : 0;
  const minutes = m[5] ? Number(m[5]) : 0;
  const seconds = m[6] ? Number(m[6]) : 0;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day, hours, minutes, seconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") return excelSerialToDate(value);
  const text = asString(value);
  if (!text) return null;
  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) return native;
  return parseLocaleDateString(text);
}

function formatLocalDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const a = asString(row[0]).toLowerCase();
  const c = asString(row[2]).toLowerCase();
  if (!a && !c) return false;
  if (/address|адрес|точк|point|מקור|איסוף/.test(a)) return true;
  if (/date|time|дата|время|תאריך|שעה/.test(c)) return true;
  return false;
}

export function parseTranscriptWorkbookBuffer(buffer: ArrayBuffer): ParseTranscriptWorkbookResult {
  const errors: string[] = [];
  const rows: ParsedTranscriptTripRow[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return { rows: [], errors: ["Could not read spreadsheet file."] };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["Workbook has no sheets."] };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const addressA = asString(row[0]);
    const addressB = asString(row[1]);
    const tripRaw = row[2];
    if (!addressA && !addressB && (tripRaw === "" || tripRaw == null)) continue;
    if (looksLikeHeaderRow(row) && rows.length === 0 && i === 0) continue;

    const tripAt = parseDateCell(tripRaw);
    if (!tripAt) {
      errors.push(`Row ${i + 1}: invalid or empty trip date/time (column C).`);
      continue;
    }
    if (!addressA || !addressB) {
      errors.push(`Row ${i + 1}: columns A and B must both contain addresses.`);
      continue;
    }
    rows.push({
      rowNumber: i + 1,
      addressA,
      addressB,
      tripAt,
      tripDisplay: typeof tripRaw === "string" && tripRaw.trim() ? tripRaw.trim() : formatLocalDateTime(tripAt),
    });
  }

  return { rows, errors };
}
