import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  getPointsForApi as getCsvPointsForApi,
  loadB2cHeatmapTripsFromCsv,
  subsamplePoints,
  type B2cHeatmapTripPoint,
} from "@/lib/b2c-heatmap-trips";
import {
  getJerusalemWallFromUtcMs,
  jerusalemDateRangeToUtcBounds,
  wallDateKey,
} from "@/lib/jerusalem-wall-time";

const SUPABASE_TABLE = process.env.B2C_HEATMAP_SUPABASE_TABLE?.trim() || "b2c_heatmap_trip_starts";
const SUPABASE_FETCH_LIMIT = Number(process.env.B2C_HEATMAP_SUPABASE_FETCH_LIMIT ?? "150000");
const MAX_POINTS_RESPONSE = 45_000;

type HeatmapMeta = {
  minDate: string | null;
  maxDate: string | null;
  totalRows: number;
};

function sourceMode(): "csv" | "supabase" {
  const raw = (process.env.B2C_HEATMAP_SOURCE ?? "csv").trim().toLowerCase();
  return raw === "supabase" ? "supabase" : "csv";
}

async function readSupabaseMeta(): Promise<HeatmapMeta> {
  const supabase = getSupabaseAdminClient();
  const [{ data: minRow, error: minError }, { data: maxRow, error: maxError }, { count, error: countError }] =
    await Promise.all([
      supabase
        .from(SUPABASE_TABLE)
        .select("trip_ts")
        .order("trip_ts", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(SUPABASE_TABLE)
        .select("trip_ts")
        .order("trip_ts", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }),
    ]);
  if (minError || maxError || countError) {
    throw new Error(
      minError?.message ?? maxError?.message ?? countError?.message ?? "Failed reading Supabase heatmap metadata.",
    );
  }
  if (!minRow?.trip_ts || !maxRow?.trip_ts) {
    return { minDate: null, maxDate: null, totalRows: 0 };
  }
  const minDate = wallDateKey(getJerusalemWallFromUtcMs(new Date(minRow.trip_ts).getTime()));
  const maxDate = wallDateKey(getJerusalemWallFromUtcMs(new Date(maxRow.trip_ts).getTime()));
  return { minDate, maxDate, totalRows: Number(count ?? 0) };
}

async function readSupabasePoints(fromYmd: string, toYmdInclusive: string): Promise<B2cHeatmapTripPoint[]> {
  const bounds = jerusalemDateRangeToUtcBounds(fromYmd, toYmdInclusive);
  if (!bounds) return [];
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select("source_lat,source_lon,trip_ts")
    .gte("trip_ts", new Date(bounds.fromMs).toISOString())
    .lt("trip_ts", new Date(bounds.toExclusiveMs).toISOString())
    .order("trip_ts", { ascending: true })
    .limit(Math.max(1, SUPABASE_FETCH_LIMIT));
  if (error) throw new Error(error.message);
  const points: B2cHeatmapTripPoint[] = [];
  for (const row of data ?? []) {
    const lat = Number(row.source_lat);
    const lon = Number(row.source_lon);
    const ts = new Date(String(row.trip_ts ?? "")).getTime();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ts)) continue;
    points.push({ lat, lon, ts });
  }
  return subsamplePoints(points, MAX_POINTS_RESPONSE);
}

export async function getHeatmapMeta(): Promise<HeatmapMeta> {
  if (sourceMode() === "supabase" && isSupabaseConfigured()) {
    return readSupabaseMeta();
  }
  const all = loadB2cHeatmapTripsFromCsv();
  if (all.length === 0) return { minDate: null, maxDate: null, totalRows: 0 };
  const minDate = wallDateKey(getJerusalemWallFromUtcMs(all[0]!.ts));
  const maxDate = wallDateKey(getJerusalemWallFromUtcMs(all[all.length - 1]!.ts));
  return { minDate, maxDate, totalRows: all.length };
}

export async function getHeatmapPoints(fromYmd: string, toYmdInclusive: string): Promise<B2cHeatmapTripPoint[]> {
  if (sourceMode() === "supabase" && isSupabaseConfigured()) {
    return readSupabasePoints(fromYmd, toYmdInclusive);
  }
  return getCsvPointsForApi(fromYmd, toYmdInclusive);
}

