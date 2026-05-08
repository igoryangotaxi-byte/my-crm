import { createGettDeliveryOrder, type GettOrderReferenceInput } from "@/lib/gett-api";
import { searchAddressSuggestions } from "@/lib/geocoding";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const rows = await searchAddressSuggestions({ query: address, language: "en", limit: 1 });
  const first = rows[0];
  if (!first) return null;
  return { lat: first.lat, lng: first.lon };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const productId = str(body?.productId);
  const quoteId = str(body?.quoteId);
  const pickupContactName = str(body?.pickupContactName);
  const pickupContactPhone = str(body?.pickupContactPhone);
  let originLat = num(body?.originLat);
  let originLng = num(body?.originLng);
  const originAddress = str(body?.originAddress);
  const scheduledAt = str(body?.scheduledAt) || null;
  const noteToDriver = str(body?.noteToDriver) || null;
  const paymentType = str(body?.paymentType) || null;
  const idempotencyKey = str(body?.idempotencyKey) || null;
  const referencesRaw = body?.references;
  const references = Array.isArray(referencesRaw)
    ? referencesRaw
        .map((r) => {
          const o = r as Record<string, unknown>;
          const id = Number(o.id);
          const value = str(o.value);
          if (!Number.isFinite(id) || !value) return null;
          const title = str(o.title);
          return title ? { id, value, title } : { id, value };
        })
        .filter((x): x is GettOrderReferenceInput => x != null)
    : [];

  if ((originLat == null || originLng == null) && originAddress) {
    const geo = await geocodeAddress(originAddress);
    if (geo) {
      originLat = geo.lat;
      originLng = geo.lng;
    }
  }

  const dropsRaw = Array.isArray(body?.dropoffs) ? body.dropoffs : [];
  const dropoffs: Array<{
    lat: number;
    lng: number;
    address: string;
    parcelName: string;
    contactName: string;
    contactPhone: string;
  }> = [];
  for (const row of dropsRaw) {
    const o = row as Record<string, unknown>;
    const address = str(o.address);
    const parcelName = str(o.parcelName);
    const contactName = str(o.contactName);
    const contactPhone = str(o.contactPhone);
    let lat = num(o.lat);
    let lng = num(o.lng);
    if ((lat == null || lng == null) && address) {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    if (address && parcelName && contactName && contactPhone && lat != null && lng != null) {
      dropoffs.push({ lat, lng, address, parcelName, contactName, contactPhone });
    }
  }

  if (
    !productId ||
    !quoteId ||
    !pickupContactName ||
    !pickupContactPhone ||
    !originAddress ||
    originLat == null ||
    originLng == null ||
    dropoffs.length < 1
  ) {
    return Response.json(
      { ok: false, error: "Missing required fields for Gett delivery (pickup, dropoffs with geocodable addresses)." },
      { status: 400 },
    );
  }

  try {
    const result = await createGettDeliveryOrder({
      productId,
      quoteId,
      pickupContactName,
      pickupContactPhone,
      originLat,
      originLng,
      originAddress,
      dropoffs,
      scheduledAt,
      noteToDriver,
      paymentType,
      references: references.length ? references : undefined,
      idempotencyKey,
    });
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create delivery order." },
      { status: 500 },
    );
  }
}
