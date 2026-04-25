import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LatLon = { lat: number; lon: number };
type Congestion = "low" | "moderate" | "heavy";

type RouteTrafficSegmentFeature = {
  type: "Feature";
  properties: { congestion: Congestion };
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
};

type RouteTrafficFeatureCollection = {
  type: "FeatureCollection";
  features: RouteTrafficSegmentFeature[];
};

type RoutePreviewPayload = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  geojson: { type: "LineString"; coordinates: Array<[number, number]> };
  /** Per-segment line for speed-based coloring on the client. */
  trafficGeojson: RouteTrafficFeatureCollection | null;
};

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = Number(input.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function normalizePoints(input: unknown): LatLon[] {
  if (!Array.isArray(input)) return [];
  const out: LatLon[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as { lat?: unknown; lon?: unknown };
    const lat = toFiniteNumber(row.lat);
    const lon = toFiniteNumber(row.lon);
    if (lat == null || lon == null) continue;
    out.push({ lat, lon });
  }
  return out;
}

function congestionFromOsrmStep(distanceM: number, durationS: number): Congestion {
  if (!(durationS > 0) || !(distanceM > 0)) return "low";
  const kmh = (distanceM / 1000 / durationS) * 3600;
  if (kmh < 12 && distanceM > 80) return "heavy";
  if (kmh < 28) return "moderate";
  return "low";
}

function buildTrafficFeatureCollection(
  coordinates: Array<[number, number]>,
  edgeCongestion: Congestion[],
): RouteTrafficFeatureCollection | null {
  if (coordinates.length < 2 || edgeCongestion.length !== coordinates.length - 1) return null;
  const features: RouteTrafficSegmentFeature[] = [];
  let runStart = 0;
  let runLevel = edgeCongestion[0] ?? "low";
  for (let i = 1; i <= edgeCongestion.length; i++) {
    const atEnd = i === edgeCongestion.length;
    const same = !atEnd && edgeCongestion[i] === runLevel;
    if (!same) {
      const slice = coordinates.slice(runStart, i + 1);
      if (slice.length >= 2) {
        features.push({
          type: "Feature",
          properties: { congestion: runLevel },
          geometry: { type: "LineString", coordinates: slice },
        });
      }
      if (!atEnd) {
        runStart = i;
        runLevel = edgeCongestion[i] ?? "low";
      }
    }
  }
  return features.length ? { type: "FeatureCollection", features } : null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOsrmRoute(points: LatLon[], timeoutMs: number): Promise<RoutePreviewPayload> {
  const base = process.env.OSRM_BASE_URL?.trim() || "https://router.project-osrm.org";
  const coordPath = points.map((point) => `${point.lon},${point.lat}`).join(";");
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    alternatives: "false",
    steps: "true",
  });
  const response = await fetchWithTimeout(
    `${base}/route/v1/driving/${coordPath}?${params.toString()}`,
    timeoutMs,
  );
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`OSRM HTTP ${response.status}: ${raw.slice(0, 200)}`);
  }
  const payload = (await response.json().catch(() => null)) as
    | {
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: Array<[number, number]> };
          legs?: Array<{
            steps?: Array<{
              distance?: number;
              duration?: number;
              geometry?: { coordinates?: Array<[number, number]> };
            }>;
          }>;
        }>;
      }
    | null;
  const route = payload?.routes?.[0];
  const mainCoords = route?.geometry?.coordinates ?? [];
  const stepFeatures: RouteTrafficSegmentFeature[] = [];
  for (const leg of route?.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const dist = typeof step.distance === "number" ? step.distance : 0;
      const dur = typeof step.duration === "number" ? step.duration : 0;
      const coords = step.geometry?.coordinates ?? [];
      if (coords.length < 2) continue;
      const level = congestionFromOsrmStep(dist, dur);
      stepFeatures.push({
        type: "Feature",
        properties: { congestion: level },
        geometry: { type: "LineString", coordinates: coords as Array<[number, number]> },
      });
    }
  }
  const trafficGeojson: RouteTrafficFeatureCollection | null =
    stepFeatures.length > 0
      ? { type: "FeatureCollection" as const, features: stepFeatures }
      : mainCoords.length >= 2
        ? buildTrafficFeatureCollection(
            mainCoords,
            new Array<Congestion>(Math.max(0, mainCoords.length - 1)).fill("low"),
          )
        : null;

  return {
    distanceMeters: typeof route?.distance === "number" ? route.distance : null,
    durationSeconds: typeof route?.duration === "number" ? route.duration : null,
    geojson: {
      type: "LineString",
      coordinates: route?.geometry?.coordinates ?? [],
    },
    trafficGeojson,
  };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { points?: unknown } | null;
  const points = normalizePoints(body?.points);
  if (points.length < 2) {
    return Response.json({ ok: false, error: "At least 2 points are required." }, { status: 400 });
  }

  const timeoutMsRaw = Number(process.env.ROUTE_PROVIDER_TIMEOUT_MS ?? "5000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1500, timeoutMsRaw) : 5000;

  try {
    const route = await fetchOsrmRoute(points, timeoutMs);
    return Response.json(
      {
        ok: true,
        route,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build route preview.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
