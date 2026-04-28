import * as XLSX from "xlsx";
import {
  canonicalizePhone,
  isLikelyPhone,
  normalizePhone as normalizePhoneShared,
} from "@/lib/phone-utils";

export const MAX_ADDRESSES_PER_RIDE = 5;

export type XlsxRideRow = {
  rowIndex: number;
  scheduleAtIso: string | null;
  phone: string;
  comment: string;
  addresses: string[];
  /**
   * Phone numbers that align 1:1 with `addresses`. Empty strings where blank.
   * Index 0 corresponds to pickup and is parsed but ignored by the SMS dispatch.
   */
  addressPhones: string[];
  errors: string[];
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return "";
}

/** Excel serial → JS Date. Excel epoch is 1899-12-30 due to the 1900 leap-year bug. */
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 24 * 60 * 60 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse `dd.mm.yyyy hh:mm[:ss]`, `dd/mm/yyyy hh:mm[:ss]` (Israeli/Russian common forms). */
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

function normalizePhone(value: unknown): string {
  return normalizePhoneShared(value);
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const first = row[0];
  if (first instanceof Date) return false;
  if (typeof first === "number") return false;
  const text = asString(first).toLowerCase();
  if (!text) return false;
  if (parseDateCell(text)) return false;
  return /date|time|when|дата|время|תאריך|שעה/.test(text);
}

function findDateInText(text: string): Date | null {
  const m = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractSheetDate(rows: unknown[][]): Date | null {
  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const text = asString(cell);
      if (!text) continue;
      const parsed = findDateInText(text);
      if (parsed) return parsed;
    }
  }
  return null;
}

function looksLikeDispatchReportFormat(rows: unknown[][]): boolean {
  return rows.some((row) => {
    const first = asString(row[0]).toLowerCase();
    const details = asString(row[10]).toLowerCase();
    return first.includes("טלפון") || details.includes("כתובת");
  });
}

function parseDispatchReportRows(rows: unknown[][]): XlsxRideRow[] {
  const result: XlsxRideRow[] = [];
  const reportDate = extractSheetDate(rows);
  const routeSeedRow = rows.find((row) => asString(row[4]).includes(","));
  const routeSeed = asString(routeSeedRow?.[4])
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const fallbackPickup = routeSeed[0] ?? "";
  const fallbackDestination = routeSeed[routeSeed.length - 1] ?? "";

  type RowPoint = {
    rowIndex: number;
    order: number;
    address: string;
    time: Date | null;
    phone: string;
    riderName: string;
    riderComment: string;
  };
  const points: RowPoint[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const marker = asString(row[0]);
    if (!marker.match(/^\(\d+\)$/)) continue;
    const order = Number(asString(row[13]));
    const address = asString(row[10]);
    if (!Number.isFinite(order) || order <= 0 || !address) continue;
    points.push({
      rowIndex: i + 1,
      order,
      address,
      time: parseDateCell(row[11]),
      phone: canonicalizePhone(row[3]),
      riderName: asString(row[6]),
      riderComment: asString(row[1]),
    });
  }

  let currentChunk: RowPoint[] = [];
  const chunks: RowPoint[][] = [];
  for (const point of points) {
    if (point.order === 1 && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [point];
      continue;
    }
    currentChunk.push(point);
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  for (const chunk of chunks) {
    const sorted = [...chunk].sort((a, b) => a.order - b.order);
    const pointA = sorted.find((item) => item.order === 1) ?? sorted[0] ?? null;
    const addresses = sorted.map((item) => item.address).filter(Boolean);
    const phoneCandidate = pointA?.phone && isLikelyPhone(pointA.phone) ? pointA.phone : "";
    const phone =
      phoneCandidate ||
      sorted.map((item) => item.phone).find((item) => item && isLikelyPhone(item)) ||
      "";
    const comment = [pointA?.riderName ?? "", pointA?.riderComment ?? ""].filter(Boolean).join(" | ");
    const errors: string[] = [];

    if (!phone) {
      // No passenger phone means this chunk is not an actionable ride row.
      continue;
    }
    if (addresses.length < 2) {
      errors.push("Need at least pickup and destination points (#1, #2).");
    }

    let scheduleAtIso: string | null = null;
    if (!reportDate || !pointA?.time) {
      errors.push("Datetime is required from point #1 (column with time).");
    } else {
      const merged = new Date(
        reportDate.getFullYear(),
        reportDate.getMonth(),
        reportDate.getDate(),
        pointA.time.getHours(),
        pointA.time.getMinutes(),
        pointA.time.getSeconds(),
        0,
      );
      scheduleAtIso = Number.isNaN(merged.getTime()) ? null : merged.toISOString();
      if (!scheduleAtIso) errors.push("Invalid datetime.");
    }

    result.push({
      rowIndex: pointA?.rowIndex ?? sorted[0].rowIndex,
      scheduleAtIso,
      phone,
      comment,
      addresses:
        addresses.length > 0 ? addresses : [fallbackPickup, fallbackDestination].filter(Boolean),
      addressPhones: new Array(Math.max(addresses.length, 2)).fill(""),
      errors,
    });
  }

  return result;
}

export async function parseXlsxRidesFile(file: File): Promise<XlsxRideRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });

  if (looksLikeDispatchReportFormat(rows)) {
    return parseDispatchReportRows(rows);
  }

  const start = rows.length > 0 && looksLikeHeaderRow(rows[0]) ? 1 : 0;
  const result: XlsxRideRow[] = [];

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowIndex = i + 1;
    const errors: string[] = [];

    const dateCell = row[0];
    const date = parseDateCell(dateCell);
    let scheduleAtIso: string | null = null;
    if (!date) {
      if (asString(dateCell)) {
        errors.push("Invalid datetime in column A.");
      } else {
        errors.push("Datetime (column A) is required.");
      }
    } else {
      scheduleAtIso = date.toISOString();
    }

    const phone = normalizePhone(row[1]);
    if (!phone) {
      errors.push("Phone (column B) is required.");
    }

    const comment = asString(row[2]);

    const addressStartCol = 3;
    const phoneStartCol = addressStartCol + MAX_ADDRESSES_PER_RIDE;
    const rawAddresses: string[] = [];
    const rawAddressPhones: string[] = [];
    for (let i = 0; i < MAX_ADDRESSES_PER_RIDE; i += 1) {
      rawAddresses.push(asString(row[addressStartCol + i]));
      rawAddressPhones.push(normalizePhone(row[phoneStartCol + i]));
    }
    let lastNonEmpty = -1;
    for (let idx = rawAddresses.length - 1; idx >= 0; idx -= 1) {
      if (rawAddresses[idx]) {
        lastNonEmpty = idx;
        break;
      }
    }
    const addresses = lastNonEmpty >= 0 ? rawAddresses.slice(0, lastNonEmpty + 1) : [];
    const addressPhones = lastNonEmpty >= 0 ? rawAddressPhones.slice(0, lastNonEmpty + 1) : [];

    if (addresses.length === 0 || !addresses[0]) {
      errors.push("Pickup (column D) is required.");
    } else if (addresses.filter((entry) => entry.length > 0).length < 2) {
      errors.push("Need at least pickup and destination (columns D and E).");
    } else if (addresses.some((entry) => !entry)) {
      errors.push("Empty cell between pickup and destination.");
    }

    if (
      !scheduleAtIso &&
      !phone &&
      !comment &&
      addresses.every((entry) => !entry)
    ) {
      continue;
    }

    result.push({
      rowIndex,
      scheduleAtIso,
      phone,
      comment,
      addresses,
      addressPhones,
      errors,
    });
  }

  return result;
}
