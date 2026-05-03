import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  decodeGooglePolyline,
  googleComputeRoute,
  googleComputeRouteMatrix,
  type LatLon,
} from "@/lib/google-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_OTHERS = 8;

type RouteOptimizePayload = {
  orderedIndices: number[];
  optimized: {
    durationSeconds: number;
    distanceMeters: number;
    encodedPolyline: string;
    coordinates: Array<[number, number]>;
    legs: Array<{ durationSeconds: number; distanceMeters: number }>;
  };
  original: { durationSeconds: number; distanceMeters: number | null };
  savingsSeconds: number;
  /** Sum of matrix leg distances (original order) minus full-route distance, when both exist. */
  savingsMeters: number | null;
};

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = Number(input.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function readPoint(input: unknown): LatLon | null {
  if (!input || typeof input !== "object") return null;
  const row = input as { lat?: unknown; lon?: unknown };
  const lat = toFiniteNumber(row.lat);
  const lon = toFiniteNumber(row.lon);
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

function readOthers(input: unknown): LatLon[] {
  if (!Array.isArray(input)) return [];
  const out: LatLon[] = [];
  for (const item of input) {
    const point = readPoint(item);
    if (point) out.push(point);
  }
  return out;
}

/**
 * Open TSP with fixed start (index 0). Brute-force over permutations of the remaining indexes.
 * Total time uses traffic-aware durations from `matrix`.
 * Returns the best ordering of the `others` (NOT including the pickup at index 0) and total seconds.
 */
function solveOpenTsp(
  matrix: Array<Array<number | null>>,
  othersCount: number,
): { order: number[]; total: number } | null {
  const indexes = Array.from({ length: othersCount }, (_, idx) => idx + 1);
  let best: { order: number[]; total: number } | null = null;

  const visit = (current: number[], remaining: number[]) => {
    if (remaining.length === 0) {
      let total = 0;
      let prev = 0;
      for (const idx of current) {
        const cell = matrix[prev][idx];
        if (cell == null) return;
        total += cell;
        prev = idx;
      }
      if (!best || total < best.total) {
        best = {
          order: current.map((idx) => idx - 1),
          total,
        };
      }
      return;
    }
    for (let i = 0; i < remaining.length; i += 1) {
      const next = remaining[i];
      const nextRemaining = remaining.slice(0, i).concat(remaining.slice(i + 1));
      visit([...current, next], nextRemaining);
    }
  };

  visit([], indexes);
  return best;
}

/** Same as open TSP but graph index `othersCount` (last "other") must stay last — for round-trip style routes. */
function solveOpenTspFixedDestination(
  matrix: Array<Array<number | null>>,
  othersCount: number,
): { order: number[]; total: number } | null {
  if (othersCount < 2) return null;
  const movableGraphIndices = Array.from({ length: othersCount - 1 }, (_, idx) => idx + 1);
  let best: { order: number[]; total: number } | null = null;

  const visit = (current: number[], remaining: number[]) => {
    if (remaining.length === 0) {
      const fullPath = [...current, othersCount];
      let total = 0;
      let prev = 0;
      for (const graphIdx of fullPath) {
        const cell = matrix[prev][graphIdx];
        if (cell == null) return;
        total += cell;
        prev = graphIdx;
      }
      const order = fullPath.map((graphIdx) => graphIdx - 1);
      if (!best || total < best.total) {
        best = { order, total };
      }
      return;
    }
    for (let i = 0; i < remaining.length; i += 1) {
      const next = remaining[i];
      const nextRemaining = remaining.slice(0, i).concat(remaining.slice(i + 1));
      visit([...current, next], nextRemaining);
    }
  };

  visit([], movableGraphIndices);
  return best;
}

function sumOriginalDuration(
  matrix: Array<Array<number | null>>,
  othersCount: number,
): number | null {
  let total = 0;
  let prev = 0;
  for (let i = 1; i <= othersCount; i += 1) {
    const cell = matrix[prev][i];
    if (cell == null) return null;
    total += cell;
    prev = i;
  }
  return total;
}

function sumOriginalDistance(
  matrix: Array<Array<number | null>>,
  othersCount: number,
): number | null {
  let total = 0;
  let prev = 0;
  for (let i = 1; i <= othersCount; i += 1) {
    const cell = matrix[prev][i];
    if (cell == null) return null;
    total += cell;
    prev = i;
  }
  return total;
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        error:
          "Route optimization needs GOOGLE_MAPS_API_KEY in the deployment environment (Vercel → Project → Settings → Environment Variables). Use the same server key as for route preview; enable Routes API on the Google Cloud project.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { pickup?: unknown; others?: unknown; fixDestination?: unknown }
    | null;
  const pickup = readPoint(body?.pickup);
  const others = readOthers(body?.others);
  const fixDestination =
    body?.fixDestination === true || body?.fixDestination === "true" || body?.fixDestination === 1;
  if (!pickup) {
    return Response.json(
      { ok: false, error: "Pick a pickup address on the map first." },
      { status: 400 },
    );
  }
  if (others.length < 2) {
    return Response.json(
      { ok: false, error: "Add at least two stops (or one stop and a destination) before optimizing." },
      { status: 400 },
    );
  }
  if (others.length > MAX_OTHERS) {
    return Response.json(
      { ok: false, error: "Too many stops for one trip. Remove some and try again." },
      { status: 400 },
    );
  }

  const timeoutMsRaw = Number(process.env.ROUTE_PROVIDER_TIMEOUT_MS ?? "8000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1500, timeoutMsRaw) : 8000;
  const allPoints: LatLon[] = [pickup, ...others];

  try {
    const matrix = await googleComputeRouteMatrix(allPoints, apiKey, timeoutMs);
    const originalDuration = sumOriginalDuration(matrix.durations, others.length);
    const originalDistance = sumOriginalDistance(matrix.distances, others.length);
    if (originalDuration == null) {
      throw new Error("No drivable route was found for these addresses in the current order.");
    }
    const best = fixDestination
      ? solveOpenTspFixedDestination(matrix.durations, others.length)
      : solveOpenTsp(matrix.durations, others.length);
    if (!best) {
      throw new Error("No drivable route was found between these addresses.");
    }

    const orderedPoints: LatLon[] = [pickup, ...best.order.map((idx) => others[idx])];
    let optimizedRoute;
    try {
      optimizedRoute = await googleComputeRoute(orderedPoints, apiKey, timeoutMs);
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.error("[route-optimize:full-route]", error);
      }
      const msg =
        error instanceof Error ? error.message.trim() : "Appli Taxi full route request failed.";
      return Response.json(
        { ok: false, error: relabelGoogleVendorForDisplay(msg || "Appli Taxi full route request failed.") },
        { status: 502 },
      );
    }

    const optDist = optimizedRoute.distanceMeters;
    const savingsMeters =
      originalDistance != null && optDist > 0 ? Math.max(0, originalDistance - optDist) : null;

    const payload: RouteOptimizePayload = {
      orderedIndices: best.order,
      optimized: {
        durationSeconds: optimizedRoute.durationSeconds || best.total,
        distanceMeters: optimizedRoute.distanceMeters,
        encodedPolyline: optimizedRoute.encodedPolyline,
        coordinates:
          optimizedRoute.coordinates.length > 0
            ? optimizedRoute.coordinates
            : decodeGooglePolyline(optimizedRoute.encodedPolyline),
        legs: optimizedRoute.legs,
      },
      original: { durationSeconds: originalDuration, distanceMeters: originalDistance },
      savingsSeconds: Math.max(0, originalDuration - (optimizedRoute.durationSeconds || best.total)),
      savingsMeters,
    };

    return Response.json(
      { ok: true, result: payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[route-optimize]", error);
    }
    const message =
      error instanceof Error ? error.message.trim() : "Route optimization failed.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(message || "Route optimization failed.") },
      { status: 502 },
    );
  }
}
