import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";

/**
 * Classic Google Geocoding API (JSON) — same API key as Routes / Maps JS.
 * Enable "Geocoding API" on the GCP project that owns GOOGLE_MAPS_API_KEY.
 *
 * https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 */

const GEOCODE_JSON = "https://maps.googleapis.com/maps/api/geocode/json";

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; data: unknown; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const raw = await response.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, data, raw };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip bidi / BOM marks that sometimes appear in spreadsheet exports. */
export function normalizeAddressForGeocode(address: string): string {
  return address.replace(/[\u200e\u200f\ufeff]/g, "").trim();
}

export async function googleGeocodeLatLon(
  address: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ lat: number; lon: number } | null> {
  const q = normalizeAddressForGeocode(address);
  if (!q) return null;

  const params = new URLSearchParams({
    address: q,
    key: apiKey,
    region: "il",
  });
  const url = `${GEOCODE_JSON}?${params.toString()}`;

  try {
    const { ok, data, raw } = await fetchJsonWithTimeout(url, timeoutMs);
    if (!ok) {
      if (process.env.NODE_ENV !== "test") {
        console.error("[google-geocoding] HTTP", raw.slice(0, 500));
      }
      return null;
    }

    const payload = data as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: unknown; lng?: unknown } } }>;
      error_message?: string;
    } | null;

    const status = payload?.status;
    if (status === "ZERO_RESULTS") return null;

    if (status !== "OK" || !payload?.results?.length) {
      const msg = payload?.error_message ?? status ?? "Geocoding failed";
      if (process.env.NODE_ENV !== "test") {
        console.error("[google-geocoding]", status, msg);
      }
      return null;
    }

    const loc = payload.results[0]?.geometry?.location;
    const lat = typeof loc?.lat === "number" ? loc.lat : Number(loc?.lat);
    const lng = typeof loc?.lng === "number" ? loc.lng : Number(loc?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lon: lng };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV !== "test") {
      console.error("[google-geocoding]", relabelGoogleVendorForDisplay(raw));
    }
    return null;
  }
}
