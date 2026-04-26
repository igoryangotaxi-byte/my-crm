import * as XLSX from "xlsx";
import { normalizePhone as normalizePhoneShared } from "@/lib/phone-utils";

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
