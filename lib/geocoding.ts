type NominatimSearchItem = {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
  address?: Record<string, string | undefined>;
};

type GovMapRawItem = Record<string, unknown>;

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

/** Nominatim structured `street`+`city` is unreliable for RTL/Cyrillic free text (and weak hits can block the `q` fallback). */
function prefersFreeTextGeocodeOnly(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text) || /[\u0400-\u04FF]/.test(text);
}

/**
 * OSM often indexes "הירקון" without the leading word "רחוב" (street); free-text `q` then returns [].
 * Strip common street-type prefixes so Nominatim matches typical map-style Hebrew typing.
 */
function normalizeHebrewAddressQueryForGeocode(query: string): string {
  if (!/[\u0590-\u05FF]/.test(query)) return query;
  return query
    .replace(/(^|\s)רחוב\s+/g, "$1")
    .replace(/(^|\s)רח['׳]\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeGovMapBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

function extractGovMapRows(payload: unknown): GovMapRawItem[] {
  if (Array.isArray(payload)) return payload.filter((row): row is GovMapRawItem => !!row && typeof row === "object");
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const containers = [
    root.data,
    root.results,
    root.items,
    root.suggestions,
    root.value,
    root.response,
  ];
  for (const value of containers) {
    if (Array.isArray(value)) return value.filter((row): row is GovMapRawItem => !!row && typeof row === "object");
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (Array.isArray(nested.results)) {
        return nested.results.filter((row): row is GovMapRawItem => !!row && typeof row === "object");
      }
      if (Array.isArray(nested.items)) {
        return nested.items.filter((row): row is GovMapRawItem => !!row && typeof row === "object");
      }
    }
  }
  return [];
}

function pickGovMapText(row: GovMapRawItem): string {
  const candidates = [
    row.label,
    row.display_name,
    row.displayName,
    row.address,
    row.name,
    row.text,
    row.title,
    row.fullAddress,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

function pickGovMapNumber(row: GovMapRawItem, keys: string[]): number | null {
  for (const key of keys) {
    const num = toFiniteNumber(row[key]);
    if (num != null) return num;
  }
  return null;
}

function toGovMapSuggestion(row: GovMapRawItem): AddressSuggestion | null {
  const lat = pickGovMapNumber(row, ["lat", "latitude", "y", "Y"]);
  const lon = pickGovMapNumber(row, ["lon", "lng", "long", "longitude", "x", "X"]);
  if (lat == null || lon == null) return null;
  const displayName = pickGovMapText(row);
  if (!displayName) return null;
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts.length > 0 ? parts[0] : null;
  const city = parts.length > 1 ? parts[1] : null;
  const label = buildSuggestionLabel(street, city, displayName);
  return { lat, lon, label, street, city, displayName };
}

function geocodingSuggestProvider(): "osm" | "govmap" {
  const raw = (process.env.GEOCODING_SUGGEST_PROVIDER ?? "").trim().toLowerCase();
  return raw === "govmap" ? "govmap" : "osm";
}

async function govMapSearch(input: {
  query: string;
  language: "he" | "ru" | "en";
  limit: number;
}): Promise<AddressSuggestion[]> {
  const baseUrl = normalizeGovMapBaseUrl(process.env.GOVMAP_SUGGEST_BASE_URL ?? "");
  if (!baseUrl) return [];
  const endpoint = process.env.GOVMAP_SUGGEST_PATH?.trim() || "/api/search";
  const apiKey = (process.env.GOVMAP_API_KEY ?? "").trim();
  const params = new URLSearchParams({
    q: input.query,
    query: input.query,
    limit: String(Math.max(1, Math.min(input.limit, 10))),
    lang: input.language,
  });
  if (apiKey) params.set("apiKey", apiKey);
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const response = await fetch(`${baseUrl}${endpoint}?${params.toString()}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as unknown;
  const rows = extractGovMapRows(payload);
  const dedup = new Set<string>();
  const suggestions: AddressSuggestion[] = [];
  for (const row of rows) {
    const suggestion = toGovMapSuggestion(row);
    if (!suggestion) continue;
    const key = `${suggestion.lat.toFixed(5)}:${suggestion.lon.toFixed(5)}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    suggestions.push(suggestion);
    if (suggestions.length >= input.limit) break;
  }
  return suggestions;
}

export async function searchAddressSuggestions(input: {
  query: string;
  language: "he" | "ru" | "en";
  limit?: number;
}): Promise<AddressSuggestion[]> {
  const q = input.query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 8, 10));
  const provider = geocodingSuggestProvider();
  if (provider === "govmap") {
    try {
      const govRows = await govMapSearch({ query: q, language: input.language, limit });
      if (govRows.length > 0) return govRows;
    } catch {
      // non-fatal: fallback to OSM/Nominatim for resiliency
    }
  }
  const useStructured = !prefersFreeTextGeocodeOnly(q);
  const structured = useStructured ? parseStreetAndCity(q) : null;
  const geocodeQuery = normalizeHebrewAddressQueryForGeocode(q);
  const items: NominatimSearchItem[] = [];
  if (structured) {
    const sp = new URLSearchParams({
      street: structured.street,
      city: structured.city,
      limit: String(Math.min(limit + 4, 12)),
    });
    items.push(...(await nominatimSearch(sp, input.language)));
  }
  // Always run free-text `q` as well: Hebrew needs it; Latin "street, city" can otherwise fill the
  // result budget with weak structured hits and skip the full-string search entirely.
  const qParams = new URLSearchParams({
    q: geocodeQuery,
    limit: String(Math.min(limit + (structured ? 8 : 6), 20)),
  });
  items.push(...(await nominatimSearch(qParams, input.language)));
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
