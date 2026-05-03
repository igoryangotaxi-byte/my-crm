import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";

/**
 * Server-only helpers for Routes API v2 — `computeRouteMatrix` for traffic-aware
 * many-to-many durations and `computeRoutes` for the final polyline of the chosen order.
 *
 * Docs:
 *  - https://developers.google.com/maps/documentation/routes/compute_route_matrix
 *  - https://developers.google.com/maps/documentation/routes/compute_route_directions
 */

export type LatLon = { lat: number; lon: number };

export type GoogleRouteLeg = {
  durationSeconds: number;
  distanceMeters: number;
};

export type GoogleRouteResult = {
  durationSeconds: number;
  distanceMeters: number;
  encodedPolyline: string;
  coordinates: Array<[number, number]>;
  legs: GoogleRouteLeg[];
};

/** Same shape as `RequestRidesMap` `RouteTrafficFeatureCollection` (server-safe duplicate). */
export type GoogleTrafficFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { congestion: "low" | "moderate" | "heavy" };
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
};

export type GoogleDrivingRoutePreview = {
  durationSeconds: number;
  distanceMeters: number;
  coordinates: Array<[number, number]>;
  trafficGeojson: GoogleTrafficFeatureCollection | null;
};

const ROUTES_BASE = "https://routes.googleapis.com";

/** Full HTTP status + body snippet for debugging in the UI (vendor strings relabeled). */
function formatRoutesHttpError(operation: string, status: number, raw: string, logLabel: string): string {
  if (process.env.NODE_ENV !== "test") {
    console.error(`[routing:${logLabel}]`, status, raw.slice(0, 2000));
  }
  const snippet = raw.slice(0, 4000);
  return relabelGoogleVendorForDisplay(`${operation} — HTTP ${status}: ${snippet}`);
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; data: unknown; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const raw = await response.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return { status: response.status, data, raw };
  } finally {
    clearTimeout(timer);
  }
}

function readDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

type MatrixCell = { duration: number | null; distance: number | null };

export type GoogleRouteMatrix = {
  /** durations[origin][destination] in seconds; null for unreachable cells. */
  durations: Array<Array<number | null>>;
  /** distances[origin][destination] in meters; null where missing. */
  distances: Array<Array<number | null>>;
};

/** Build matrix request body — every point is both origin and destination. */
function buildMatrixBody(points: LatLon[]) {
  const waypoint = (point: LatLon) => ({
    waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lon } } },
  });
  return {
    origins: points.map(waypoint),
    destinations: points.map(waypoint),
    travelMode: "DRIVE" as const,
    routingPreference: "TRAFFIC_AWARE_OPTIMAL" as const,
  };
}

export async function googleComputeRouteMatrix(
  points: LatLon[],
  apiKey: string,
  timeoutMs: number,
): Promise<GoogleRouteMatrix> {
  if (points.length < 2) {
    throw new Error("At least two locations are required.");
  }
  const url = `${ROUTES_BASE}/distanceMatrix/v2:computeRouteMatrix`;
  const { status, data, raw } = await fetchJsonWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,duration,distanceMeters,condition,status",
      },
      body: JSON.stringify(buildMatrixBody(points)),
    },
    timeoutMs,
  );
  if (status < 200 || status >= 300) {
    throw new Error(formatRoutesHttpError("Appli Taxi route matrix", status, raw, "matrix"));
  }
  if (!Array.isArray(data)) {
    throw new Error("We couldn’t load route data. Try again.");
  }
  const size = points.length;
  const cells: MatrixCell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ duration: null, distance: null })),
  );
  for (const row of data as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const r = row as {
      originIndex?: unknown;
      destinationIndex?: unknown;
      duration?: unknown;
      distanceMeters?: unknown;
      condition?: unknown;
    };
    const oi = typeof r.originIndex === "number" ? r.originIndex : -1;
    const di = typeof r.destinationIndex === "number" ? r.destinationIndex : -1;
    if (oi < 0 || di < 0 || oi >= size || di >= size) continue;
    if (r.condition && r.condition !== "ROUTE_EXISTS") continue;
    const duration = readDurationSeconds(r.duration);
    const distance = typeof r.distanceMeters === "number" ? r.distanceMeters : null;
    cells[oi][di] = { duration, distance };
  }
  return {
    durations: cells.map((row) => row.map((cell) => cell.duration)),
    distances: cells.map((row) => row.map((cell) => cell.distance)),
  };
}

/** Decode encoded polyline (precision 5) into [lon, lat] pairs for MapLibre. */
export function decodeGooglePolyline(encoded: string): Array<[number, number]> {
  if (typeof encoded !== "string" || encoded.length === 0) return [];
  const out: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return out;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) return out;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

export async function googleComputeRoute(
  orderedPoints: LatLon[],
  apiKey: string,
  timeoutMs: number,
): Promise<GoogleRouteResult> {
  if (orderedPoints.length < 2) {
    throw new Error("At least two locations are required.");
  }
  const [origin, ...rest] = orderedPoints;
  const destination = rest[rest.length - 1];
  const intermediates = rest.slice(0, -1);
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
    intermediates: intermediates.map((point) => ({
      location: { latLng: { latitude: point.lat, longitude: point.lon } },
    })),
    travelMode: "DRIVE" as const,
    routingPreference: "TRAFFIC_AWARE_OPTIMAL" as const,
    polylineQuality: "HIGH_QUALITY" as const,
    polylineEncoding: "ENCODED_POLYLINE" as const,
    computeAlternativeRoutes: false,
  };
  const url = `${ROUTES_BASE}/directions/v2:computeRoutes`;
  const { status, data, raw } = await fetchJsonWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters",
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  if (status < 200 || status >= 300) {
    throw new Error(formatRoutesHttpError("Appli Taxi full route", status, raw, "full-route"));
  }
  const payload = data as {
    routes?: Array<{
      duration?: unknown;
      distanceMeters?: unknown;
      polyline?: { encodedPolyline?: unknown };
      legs?: Array<{ duration?: unknown; distanceMeters?: unknown }>;
    }>;
  } | null;
  const route = payload?.routes?.[0];
  if (!route) {
    throw new Error("No route was found between these points.");
  }
  const durationSeconds = readDurationSeconds(route.duration) ?? 0;
  const distanceMeters = typeof route.distanceMeters === "number" ? route.distanceMeters : 0;
  const encodedPolyline =
    typeof route.polyline?.encodedPolyline === "string" ? route.polyline.encodedPolyline : "";
  const coordinates = decodeGooglePolyline(encodedPolyline);
  const legs: GoogleRouteLeg[] = (route.legs ?? []).map((leg) => ({
    durationSeconds: readDurationSeconds(leg.duration) ?? 0,
    distanceMeters: typeof leg.distanceMeters === "number" ? leg.distanceMeters : 0,
  }));
  return { durationSeconds, distanceMeters, encodedPolyline, coordinates, legs };
}

function congestionFromSpeed(distanceM: number, durationS: number): "low" | "moderate" | "heavy" {
  if (!(durationS > 0) || !(distanceM > 0)) return "low";
  const kmh = (distanceM / 1000 / durationS) * 3600;
  if (kmh < 12 && distanceM > 80) return "heavy";
  if (kmh < 28) return "moderate";
  return "low";
}

/**
 * Traffic-aware driving route for map preview: overview polyline + per-step geometry for congestion coloring.
 */
export async function googleComputeDrivingRoutePreview(
  orderedPoints: LatLon[],
  apiKey: string,
  timeoutMs: number,
): Promise<GoogleDrivingRoutePreview> {
  if (orderedPoints.length < 2) {
    throw new Error("At least two locations are required.");
  }
  const [origin, ...rest] = orderedPoints;
  const destination = rest[rest.length - 1];
  const intermediates = rest.slice(0, -1);
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
    intermediates: intermediates.map((point) => ({
      location: { latLng: { latitude: point.lat, longitude: point.lon } },
    })),
    travelMode: "DRIVE" as const,
    routingPreference: "TRAFFIC_AWARE_OPTIMAL" as const,
    polylineQuality: "HIGH_QUALITY" as const,
    polylineEncoding: "ENCODED_POLYLINE" as const,
    computeAlternativeRoutes: false,
  };
  const url = `${ROUTES_BASE}/directions/v2:computeRoutes`;
  /** Request `routes.legs.steps` as a whole — granular step field paths often trigger INVALID_ARGUMENT on field masks. */
  const fieldMask =
    "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps";
  const { status, data, raw } = await fetchJsonWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  if (status < 200 || status >= 300) {
    throw new Error(formatRoutesHttpError("Appli Taxi route preview", status, raw, "preview"));
  }
  const payload = data as {
    routes?: Array<{
      duration?: unknown;
      distanceMeters?: unknown;
      polyline?: { encodedPolyline?: unknown };
      legs?: Array<{
        steps?: Array<{
          duration?: unknown;
          distanceMeters?: unknown;
          polyline?: { encodedPolyline?: unknown };
        }>;
      }>;
    }>;
  } | null;
  const route = payload?.routes?.[0];
  if (!route) {
    throw new Error("No route was found between these points.");
  }
  const durationSeconds = readDurationSeconds(route.duration) ?? 0;
  const distanceMeters = typeof route.distanceMeters === "number" ? route.distanceMeters : 0;
  const encodedPolyline =
    typeof route.polyline?.encodedPolyline === "string" ? route.polyline.encodedPolyline : "";
  const coordinates = decodeGooglePolyline(encodedPolyline);

  const features: GoogleTrafficFeatureCollection["features"] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const enc =
        typeof step.polyline?.encodedPolyline === "string" ? step.polyline.encodedPolyline : "";
      const stepCoords = decodeGooglePolyline(enc);
      if (stepCoords.length < 2) continue;
      const dist = typeof step.distanceMeters === "number" ? step.distanceMeters : 0;
      const dur = readDurationSeconds(step.duration) ?? 0;
      const congestion = congestionFromSpeed(dist, dur);
      features.push({
        type: "Feature",
        properties: { congestion },
        geometry: { type: "LineString", coordinates: stepCoords },
      });
    }
  }

  return {
    durationSeconds,
    distanceMeters,
    coordinates,
    trafficGeojson: features.length > 0 ? { type: "FeatureCollection", features } : null,
  };
}
