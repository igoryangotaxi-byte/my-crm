type NominatimSearchItem = {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
  address?: Record<string, string | undefined>;
};

export type GeocodePoint = { lat: number; lon: number };

export type AddressSuggestion = GeocodePoint & {
  label: string;
  street: string | null;
  city: string | null;
  displayName: string;
};

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = Number(input.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function pickStreet(address: Record<string, string | undefined> | undefined): string | null {
  if (!address) return null;
  return (
    address.road ??
    address.pedestrian ??
    address.footway ??
    address.path ??
    address.residential ??
    address.neighbourhood ??
    null
  );
}

function pickCity(address: Record<string, string | undefined> | undefined): string | null {
  if (!address) return null;
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.state_district ??
    null
  );
}

function buildSuggestionLabel(
  street: string | null,
  city: string | null,
  fallbackDisplay: string,
): string {
  if (street && city) return `${street}, ${city}`;
  if (street) return street;
  if (city) return city;
  return fallbackDisplay;
}

function normalizeCityHint(city: string): string {
  return city.trim().replace(/\btel-?\s*-?\s*aviv\b/i, "Tel Aviv");
}

/** "Street, City" as typed in the form — improves Nominatim precision vs a single free-text `q`. */
function parseStreetAndCity(query: string): { street: string; city: string } | null {
  const idx = query.indexOf(",");
  if (idx <= 0) return null;
  const street = query.slice(0, idx).trim();
  const city = normalizeCityHint(query.slice(idx + 1));
  if (street.length < 2 || city.length < 2) return null;
  return { street, city };
}

function nominatimImportance(item: NominatimSearchItem): number {
  return typeof item.importance === "number" && Number.isFinite(item.importance) ? item.importance : 0;
}

async function nominatimSearch(params: URLSearchParams, language: "he" | "ru" | "en"): Promise<NominatimSearchItem[]> {
  params.set("format", "jsonv2");
  params.set("addressdetails", "1");
  params.set("countrycodes", "il");
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": language,
      "User-Agent": "my-crm-request-rides/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) return [];
  return (await response.json().catch(() => [])) as NominatimSearchItem[];
}

function itemsToSuggestions(items: NominatimSearchItem[], limit: number): AddressSuggestion[] {
  const sorted = [...items].sort((a, b) => nominatimImportance(b) - nominatimImportance(a));
  const seen = new Set<string>();
  const rows: AddressSuggestion[] = [];
  for (const item of sorted) {
    const lat = toFiniteNumber(item.lat);
    const lon = toFiniteNumber(item.lon);
    if (lat == null || lon == null) continue;
    const displayName = (item.display_name ?? "").trim();
    if (!displayName) continue;
    const street = pickStreet(item.address);
    const city = pickCity(item.address);
    const label = buildSuggestionLabel(street, city, displayName);
    const dedupKey = `${lat.toFixed(5)}:${lon.toFixed(5)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    rows.push({ lat, lon, label, street, city, displayName });
    if (rows.length >= limit) break;
  }
  return rows;
}

export async function searchAddressSuggestions(input: {
  query: string;
  language: "he" | "ru" | "en";
  limit?: number;
}): Promise<AddressSuggestion[]> {
  const q = input.query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 8, 10));
  const structured = parseStreetAndCity(q);
  let items: NominatimSearchItem[] = [];
  if (structured) {
    const sp = new URLSearchParams({
      street: structured.street,
      city: structured.city,
      limit: String(Math.min(limit + 4, 12)),
    });
    items = await nominatimSearch(sp, input.language);
  }
  if (items.length < limit) {
    const sp = new URLSearchParams({ q, limit: String(Math.min(limit + 6, 14)) });
    const extra = await nominatimSearch(sp, input.language);
    items = [...items, ...extra];
  }
  return itemsToSuggestions(items, limit);
}

export async function reverseGeocodePoint(input: {
  lat: number;
  lon: number;
  language: "he" | "ru" | "en";
}): Promise<AddressSuggestion | null> {
  const params = new URLSearchParams({
    lat: String(input.lat),
    lon: String(input.lon),
    format: "jsonv2",
    addressdetails: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": input.language,
      "User-Agent": "my-crm-request-rides/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const item = (await response.json().catch(() => null)) as NominatimSearchItem | null;
  if (!item) return null;
  const lat = toFiniteNumber(item.lat);
  const lon = toFiniteNumber(item.lon);
  if (lat == null || lon == null) return null;
  const displayName = (item.display_name ?? "").trim();
  if (!displayName) return null;
  const street = pickStreet(item.address);
  const city = pickCity(item.address);
  const label = buildSuggestionLabel(street, city, displayName);
  return { lat, lon, label, street, city, displayName };
}
