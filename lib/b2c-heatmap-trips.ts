import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import {
  jerusalemDateRangeToUtcBounds,
  jerusalemWallToUtcMs,
  type JerusalemWall,
} from "@/lib/jerusalem-wall-time";

export type B2cHeatmapTripPoint = {
  lat: number;
  lon: number;
  ts: number;
};

const CSV_REL = ["data", "b2c-trip-starts.csv"];
const MAX_POINTS_RESPONSE = 45_000;

let cachedRows: B2cHeatmapTripPoint[] | null = null;
let cachedMtimeMs: number | null = null;
const hourBaseUtcCache = new Map<string, number>();

function parseTripDatetimeToUtcMs(raw: string): number | null {
  const s = raw.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = Number(m[6]);
  if (![y, mo, d, h, mi, sec].every((n) => Number.isFinite(n))) return null;
  const hourKey = `${y}-${mo}-${d} ${h}`;
  let hourBaseUtc = hourBaseUtcCache.get(hourKey);
  if (hourBaseUtc == null) {
    const wHour: JerusalemWall = { y, mo, d, h, mi: 0, s: 0 };
    hourBaseUtc = jerusalemWallToUtcMs(wHour);
    hourBaseUtcCache.set(hourKey, hourBaseUtc);
  }
  return hourBaseUtc + mi * 60_000 + sec * 1_000;
}

function loadCsvFromDisk(): B2cHeatmapTripPoint[] {
  const filePath = path.join(process.cwd(), ...CSV_REL);
  const buf = readFileSync(filePath, "utf8");
  const rows = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;
  const out: B2cHeatmapTripPoint[] = [];
  for (const row of rows) {
    const lat = Number(row.source_lat);
    const lon = Number(row.source_lon);
    const ts = parseTripDatetimeToUtcMs(row.trip_datetime ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || ts == null) continue;
    if (lat < 29 || lat > 34.8 || lon < 33.5 || lon > 36.5) continue;
    out.push({ lat, lon, ts });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

export function loadB2cHeatmapTripsFromCsv(): B2cHeatmapTripPoint[] {
  const filePath = path.join(process.cwd(), ...CSV_REL);
  let mtime = 0;
  try {
    mtime = statSync(filePath).mtimeMs;
  } catch {
    return [];
  }
  if (cachedRows && cachedMtimeMs === mtime) return cachedRows;
  cachedRows = loadCsvFromDisk();
  cachedMtimeMs = mtime;
  return cachedRows;
}

export function filterTripsByJerusalemDateRange(
  rows: B2cHeatmapTripPoint[],
  fromYmd: string,
  toYmdInclusive: string,
): B2cHeatmapTripPoint[] {
  const bounds = jerusalemDateRangeToUtcBounds(fromYmd, toYmdInclusive);
  if (!bounds) return [];
  return rows.filter((r) => r.ts >= bounds.fromMs && r.ts < bounds.toExclusiveMs);
}

export function subsamplePoints(points: B2cHeatmapTripPoint[], max: number): B2cHeatmapTripPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: B2cHeatmapTripPoint[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.min(points.length - 1, Math.floor(i * step));
    out.push(points[idx]!);
  }
  return out;
}

export function getPointsForApi(fromYmd: string, toYmdInclusive: string): B2cHeatmapTripPoint[] {
  const all = loadB2cHeatmapTripsFromCsv();
  const filtered = filterTripsByJerusalemDateRange(all, fromYmd, toYmdInclusive);
  return subsamplePoints(filtered, MAX_POINTS_RESPONSE);
}
