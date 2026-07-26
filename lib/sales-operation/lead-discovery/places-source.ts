import { createHash } from "node:crypto";
import type {
  EnrichedCompanyResult,
  LeadDiscoverySource,
  RawCompanyResult,
  SourceHealthStatus,
  DiscoverySearchParams,
} from "@/lib/sales-operation/lead-discovery/types";

const PLACES_NEW_BASE = "https://places.googleapis.com/v1";

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "nextPageToken",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "rating",
  "userRatingCount",
  "businessStatus",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
].join(",");

function placesKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(placesKey());
}

function extractDomain(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizePlaceId(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/^places\//, "");
}

function mapNewPlace(place: Record<string, unknown>): RawCompanyResult {
  const displayName = place.displayName as { text?: string } | undefined;
  const location = place.location as { latitude?: number; longitude?: number } | undefined;
  const types = Array.isArray(place.types) ? (place.types as string[]) : [];
  const placeId = normalizePlaceId(
    typeof place.id === "string" ? place.id : typeof place.name === "string" ? place.name : "",
  );
  return {
    placeId,
    name: displayName?.text || String(place.name ?? "Unknown"),
    address: typeof place.formattedAddress === "string" ? place.formattedAddress : null,
    city: null,
    country: "Israel",
    phone:
      typeof place.internationalPhoneNumber === "string"
        ? place.internationalPhoneNumber
        : typeof place.nationalPhoneNumber === "string"
          ? place.nationalPhoneNumber
          : null,
    website: typeof place.websiteUri === "string" ? place.websiteUri : null,
    latitude: typeof location?.latitude === "number" ? location.latitude : null,
    longitude: typeof location?.longitude === "number" ? location.longitude : null,
    category: types[0] ?? null,
    categories: types,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewsCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    businessStatus: typeof place.businessStatus === "string" ? place.businessStatus : null,
    sourceUrl:
      typeof place.googleMapsUri === "string"
        ? place.googleMapsUri
        : placeId
          ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
          : null,
  };
}

async function placesErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      error?: { message?: string; status?: string };
      message?: string;
    };
    return (
      data.error?.message ||
      data.message ||
      `Places API (New) failed: HTTP ${res.status}`
    );
  } catch {
    return `Places API (New) failed: HTTP ${res.status}`;
  }
}

async function textSearch(query: string, maxResults: number): Promise<RawCompanyResult[]> {
  const key = placesKey();
  if (!key) throw new Error("Google Places API key is not configured.");

  const out: RawCompanyResult[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      textQuery: query,
      regionCode: "IL",
      languageCode: "en",
      pageSize: Math.min(20, maxResults - out.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(`${PLACES_NEW_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(await placesErrorMessage(res));
    }

    const data = (await res.json()) as {
      places?: Record<string, unknown>[];
      nextPageToken?: string;
    };

    for (const row of data.places ?? []) {
      const mapped = mapNewPlace(row);
      if (mapped.placeId) out.push(mapped);
      if (out.length >= maxResults) return out;
    }

    pageToken = data.nextPageToken;
  } while (pageToken && out.length < maxResults);

  return out;
}

async function placeDetails(placeId: string): Promise<RawCompanyResult | null> {
  const key = placesKey();
  if (!key || !placeId) return null;
  const id = normalizePlaceId(placeId);
  const res = await fetch(`${PLACES_NEW_BASE}/places/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    // Soft-fail enrichment — search result is still usable.
    return null;
  }
  const data = (await res.json()) as Record<string, unknown>;
  return mapNewPlace(data);
}

function extractEmails(html: string): Array<{ email: string; type: string; sourceUrl?: string }> {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: Array<{ email: string; type: string }> = [];
  for (const raw of matches) {
    const email = raw.toLowerCase();
    if (seen.has(email)) continue;
    if (/(\.png|\.jpg|\.gif|example\.com|sentry\.io|wixpress|cloudflare)/i.test(email)) continue;
    seen.add(email);
    let type = "General";
    if (/hr|career|jobs/i.test(email)) type = "HR";
    else if (/ops|operation/i.test(email)) type = "Operations";
    else if (/procure|purchase/i.test(email)) type = "Procurement";
    else if (/finance|account/i.test(email)) type = "Finance";
    else if (/office|admin/i.test(email)) type = "Office Management";
    else if (/travel/i.test(email)) type = "Travel";
    out.push({ email, type });
    if (out.length >= 8) break;
  }
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "AppliTaxiCRM-LeadDiscovery/1.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return null;
  }
}

export function createGooglePlacesSource(): LeadDiscoverySource {
  return {
    id: "google_places",
    name: "Google Places (New)",
    type: "google_places",
    enabled: isGooglePlacesConfigured(),

    async search(params: DiscoverySearchParams): Promise<RawCompanyResult[]> {
      const maxResults = params.maxResults ?? 40;
      const queries: string[] = [];
      if (params.mapsQueries?.length) {
        queries.push(...params.mapsQueries);
      } else {
        const cities = params.cities.length ? params.cities : ["Tel Aviv"];
        const categories = params.categories.filter(Boolean);
        const keywords = params.keywords ?? [];
        for (const city of cities) {
          for (const cat of categories) {
            queries.push(`${cat} in ${city}, Israel`);
          }
          for (const kw of keywords) {
            queries.push(`${kw} in ${city}, Israel`);
          }
        }
        // Never invent Hotels — if nothing provided, search with a generic B2B query from keywords only.
        if (!queries.length) {
          for (const city of cities) {
            queries.push(`companies in ${city}, Israel`);
          }
        }
      }

      const byPlace = new Map<string, RawCompanyResult>();
      for (const q of queries.slice(0, 20)) {
        const results = await textSearch(q, maxResults);
        for (const r of results) {
          if (params.minRating != null && (r.rating ?? 0) < params.minRating) continue;
          if (params.minReviews != null && (r.reviewsCount ?? 0) < params.minReviews) continue;
          const excluded = (params.excludedKeywords ?? []).some((k) =>
            r.name.toLowerCase().includes(k.toLowerCase()),
          );
          if (excluded) continue;
          if (!byPlace.has(r.placeId)) byPlace.set(r.placeId, r);
          if (byPlace.size >= maxResults) break;
        }
        if (byPlace.size >= maxResults) break;
      }
      return [...byPlace.values()];
    },

    async enrich(company: RawCompanyResult): Promise<EnrichedCompanyResult> {
      const detailed = company.placeId ? await placeDetails(company.placeId) : null;
      const base: EnrichedCompanyResult = { ...(detailed ?? company) };
      base.domain = extractDomain(base.website);
      base.signals = {};

      if (base.website) {
        const root = base.website.startsWith("http") ? base.website : `https://${base.website}`;
        const home = await fetchPageText(root);
        const about = await fetchPageText(new URL("/about", root).toString()).catch(() => null);
        const careers = await fetchPageText(new URL("/careers", root).toString()).catch(() => null);
        const contact = await fetchPageText(new URL("/contact", root).toString()).catch(() => null);
        const combined = [home, about, careers, contact].filter(Boolean).join("\n");
        base.aboutText = about ?? home;
        base.careersText = careers;
        base.contactText = contact;
        base.careersPage = Boolean(careers && careers.length > 200);
        base.publicEmails = extractEmails(combined);
        base.contentHash = createHash("sha256").update(combined || base.placeId).digest("hex").slice(0, 32);

        const text = combined.toLowerCase();
        base.signals = {
          careers_page: Boolean(base.careersPage),
          active_hiring: /hiring|we're hiring|open positions|join our team/i.test(text),
          airport_transfer: /airport transfer|airport shuttle/i.test(text),
          employee_transport: /employee transport|staff shuttle|commuter/i.test(text),
          business_travel: /business travel|corporate travel/i.test(text),
          shuttle: /\bshuttle\b/i.test(text),
          works_24_7: /24\/7|24 hours|around the clock/i.test(text),
          night_shifts: /night shift|overnight/i.test(text),
          guests_visitors: /guests|visitors|patients/i.test(text),
          international: /international|global offices|worldwide/i.test(text),
        };
      } else {
        base.contentHash = createHash("sha256").update(base.placeId).digest("hex").slice(0, 32);
        base.publicEmails = [];
        base.signals = { no_website: true };
      }

      if (base.publicEmails?.length) base.signals.public_email = true;
      else base.signals.no_email = true;
      if (base.phone) base.signals.public_phone = true;
      if (!base.phone && !(base.publicEmails?.length)) base.signals.no_contact = true;
      if (base.businessStatus === "CLOSED_PERMANENTLY") base.signals.permanently_closed = true;

      const cat = `${base.category ?? ""} ${(base.categories ?? []).join(" ")}`.toLowerCase();
      if (/hotel|lodging/.test(cat)) base.signals.category_hotel = true;
      if (/hospital/.test(cat)) base.signals.category_hospital = true;
      if (/doctor|clinic|health|medical/.test(cat)) base.signals.category_medical = true;
      if (/logistics|moving_company|storage/.test(cat)) base.signals.logistics = true;

      return base;
    },

    async healthCheck(): Promise<SourceHealthStatus> {
      const started = Date.now();
      if (!isGooglePlacesConfigured()) {
        return { ok: false, message: "GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY missing" };
      }
      try {
        await textSearch("Hotels in Tel Aviv, Israel", 1);
        return { ok: true, latencyMs: Date.now() - started };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Places health check failed",
          latencyMs: Date.now() - started,
        };
      }
    },
  };
}
