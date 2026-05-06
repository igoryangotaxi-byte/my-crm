import { googleGeocodeLatLon, normalizeAddressForGeocode } from "@/lib/google-geocoding";
import { searchAddressSuggestions } from "@/lib/geocoding";
import { googleComputeRouteWithDeparture } from "@/lib/google-routes";
import { calculateYangoDriversTariff } from "@/lib/price-calculator-formulas";
import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import {
  evaluateTranscriptMotClientPrice,
  findTranscriptMotTariff,
  getJerusalemYangoTimeInputs,
  loadTranscriptMotTariffs,
} from "@/lib/transcript-mot-tariffs";
import { requireApprovedUser } from "@/lib/server-auth";
import type { PriceCalculatorTranscriptRowResult } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ROWS_PER_REQUEST = 25;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Nominatim policy is ~1 req/s; used only when Google Geocoding returns no hit. */
function nominatimFallbackDelayMs(): number {
  const raw = Number(process.env.TRANSCRIPT_NOMINATIM_DELAY_MS ?? "1100");
  return Number.isFinite(raw) ? Math.max(1000, raw) : 1100;
}

type TranscriptRowInput = {
  orderIndex?: unknown;
  addressA?: unknown;
  addressB?: unknown;
  tripIso?: unknown;
  tripDisplay?: unknown;
};

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

/** Match Request Rides / request-rides-create: Hebrew, Cyrillic (Russian), or default English for Nominatim. */
function detectAddressLanguage(input: string): "he" | "ru" | "en" {
  if (/[\u0590-\u05FF]/.test(input)) return "he";
  if (/[\u0400-\u04FF]/.test(input)) return "ru";
  return "en";
}

async function geocodeFirst(
  address: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ lat: number; lon: number } | null> {
  const cleaned = normalizeAddressForGeocode(address);
  if (!cleaned) return null;

  const googleHit = await googleGeocodeLatLon(cleaned, apiKey, timeoutMs);
  if (googleHit) return googleHit;

  await sleep(nominatimFallbackDelayMs());
  const language = detectAddressLanguage(cleaned);
  const rows = await searchAddressSuggestions({ query: cleaned, language, limit: 1 });
  const first = rows[0];
  if (!first) return null;
  return { lat: first.lat, lon: first.lon };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  /** Same server-only key as Request Rides (`/api/route-preview`, `/api/route-optimize`). */
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        error:
          "GOOGLE_MAPS_API_KEY is not configured. Use the same deployment variable as Request Rides route preview / optimization; Transcripts needs Routes API with departure time.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    tariffCode?: unknown;
    rows?: unknown;
  } | null;
  const tariffCode = normalizeString(body?.tariffCode);
  if (!tariffCode) {
    return Response.json({ ok: false, error: "tariffCode is required." }, { status: 400 });
  }
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return Response.json({ ok: false, error: "rows must be a non-empty array." }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS_PER_REQUEST) {
    return Response.json(
      { ok: false, error: `At most ${MAX_ROWS_PER_REQUEST} rows per request.` },
      { status: 400 },
    );
  }

  const tariffs = await loadTranscriptMotTariffs();
  const tariff = findTranscriptMotTariff(tariffs, tariffCode);
  if (!tariff) {
    return Response.json({ ok: false, error: "Unknown tariff code." }, { status: 400 });
  }

  const timeoutMsRaw = Number(process.env.ROUTE_PROVIDER_TIMEOUT_MS ?? "8000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(2000, timeoutMsRaw) : 8000;

  const results: PriceCalculatorTranscriptRowResult[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i] as TranscriptRowInput;
    const pointA = normalizeString(raw.addressA);
    const pointB = normalizeString(raw.addressB);
    const tripIso = normalizeString(raw.tripIso);
    const tripDisplay = normalizeString(raw.tripDisplay) || tripIso;
    const orderIndex =
      typeof raw.orderIndex === "number" && Number.isFinite(raw.orderIndex)
        ? Math.trunc(raw.orderIndex)
        : i + 1;

    const base: PriceCalculatorTranscriptRowResult = {
      orderIndex,
      tripIso,
      tripDisplay,
      pointA,
      pointB,
      km: null,
      min: null,
      clientPrice: null,
      driverPrice: null,
      decoupling: null,
      decouplingPct: null,
      error: null,
    };

    if (!pointA || !pointB || !tripIso) {
      results.push({
        ...base,
        error: "Each row needs addressA, addressB, and tripIso.",
      });
      continue;
    }

    const tripAt = new Date(tripIso);
    if (Number.isNaN(tripAt.getTime())) {
      results.push({ ...base, error: "Invalid tripIso date." });
      continue;
    }

    try {
      const geoA = await geocodeFirst(pointA, apiKey, timeoutMs);
      if (!geoA) {
        results.push({ ...base, error: "Could not geocode point A." });
        continue;
      }
      const geoB = await geocodeFirst(pointB, apiKey, timeoutMs);
      if (!geoB) {
        results.push({ ...base, error: "Could not geocode point B." });
        continue;
      }

      const route = await googleComputeRouteWithDeparture(
        [
          { lat: geoA.lat, lon: geoA.lon },
          { lat: geoB.lat, lon: geoB.lon },
        ],
        apiKey,
        timeoutMs,
        tripAt,
      );

      const km = route.distanceMeters / 1000;
      const min = route.durationSeconds / 60;
      const { weekday, timeMinutes } = getJerusalemYangoTimeInputs(tripAt);
      const clientPrice = evaluateTranscriptMotClientPrice(tariff.rules, km, tripAt);
      const driverBreakdown = calculateYangoDriversTariff(km, min, weekday, timeMinutes);
      const driverPrice = driverBreakdown.total;
      const decoupling = clientPrice - driverPrice;
      const decouplingPct =
        clientPrice > 0 ? (decoupling / clientPrice) * 100 : null;

      results.push({
        ...base,
        km: Math.round(km * 1000) / 1000,
        min: Math.round(min * 100) / 100,
        clientPrice: Math.round(clientPrice * 100) / 100,
        driverPrice: Math.round(driverPrice * 100) / 100,
        decoupling: Math.round(decoupling * 100) / 100,
        decouplingPct: decouplingPct === null ? null : Math.round(decouplingPct * 100) / 100,
        error: null,
      });
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      results.push({
        ...base,
        error: relabelGoogleVendorForDisplay(rawMsg.trim() || "Route or pricing failed."),
      });
    }
  }

  return Response.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
