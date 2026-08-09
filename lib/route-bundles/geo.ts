import type { LatLon } from "@/lib/route-bundles/types";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough driving-time lower bound (~45 km/h urban). */
export function haversineDurationSec(a: LatLon, b: LatLon, avgKmh = 45): number {
  const km = haversineKm(a, b);
  return Math.max(60, Math.round((km / avgKmh) * 3600));
}

export function pointKey(p: LatLon, precision = 4): string {
  return `${p.lat.toFixed(precision)},${p.lon.toFixed(precision)}`;
}

export function bucketDepartureIso(date: Date, bucketMin = 15): string {
  const ms = date.getTime();
  const bucketMs = bucketMin * 60_000;
  return new Date(Math.floor(ms / bucketMs) * bucketMs).toISOString();
}
