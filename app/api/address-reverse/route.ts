import { reverseGeocodePoint } from "@/lib/geocoding";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = Number(input.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function normalizeLanguage(input: unknown): "he" | "ru" | "en" {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (raw === "he" || raw === "ru" || raw === "en") return raw;
  return "en";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { lat?: unknown; lon?: unknown; language?: unknown }
    | null;
  const lat = toFiniteNumber(body?.lat);
  const lon = toFiniteNumber(body?.lon);
  const language = normalizeLanguage(body?.language);

  if (lat == null || lon == null) {
    return Response.json({ ok: false, error: "lat and lon are required." }, { status: 400 });
  }

  try {
    const suggestion = await reverseGeocodePoint({ lat, lon, language });
    if (!suggestion) {
      return Response.json({ ok: false, error: "Address not found for this point." }, { status: 404 });
    }
    return Response.json({ ok: true, suggestion }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reverse geocode point.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
