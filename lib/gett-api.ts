type GettTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type GettQuoteProduct = {
  id?: string;
  name?: string;
  description?: string;
  price?: { amount?: number; currency?: string; formatted?: string };
  eta?: { min?: number; max?: number; formatted?: string };
  availability?: "available" | "unavailable" | string;
  /** Business API: quote_id from `/v1/price-estimate` per product */
  quote_id?: string;
};

export type GettQuoteResponse = {
  status?: string;
  data?: {
    products?: GettQuoteProduct[];
    /** Present when Business API aggregates the primary quote id for the flow */
    estimation_id?: string;
    route?: {
      distance?: { value?: number; formatted?: string };
      duration?: { value?: number; formatted?: string };
    };
    surge?: { active?: boolean; multiplier?: number };
  };
};

type GettWaypointInput = {
  lat: number;
  lng: number;
};

type GettOrderResponse = {
  order?: {
    order_id?: string;
    status?: string;
    scheduled_at?: string;
    created_at?: string;
    product?: { name?: string; category?: string };
    actual?: {
      supplier?: { driver?: { driver_name?: string; driver_phone?: string; plate_number?: string } };
    };
  };
};

export type GettOrderListItem = {
  orderId: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string | null;
  productName: string | null;
  driverName: string | null;
};

export type GettIntegrationFlavor = "business" | "demand_partner";

export function mapGettOrderRow(row: Record<string, unknown>): GettOrderListItem {
  return {
    orderId: String(row.order_id ?? row.id ?? "").trim(),
    status: String(row.status ?? row.ride_status ?? "Unknown"),
    scheduledAt: (row.scheduled_at as string | undefined) ?? (row.due_datetime as string | undefined) ?? null,
    createdAt: (row.created_at as string | undefined) ?? null,
    productName: (row.product_name as string | undefined) ?? null,
    driverName: (row.driver_name as string | undefined) ?? null,
  };
}

/** Partner id from portal, or first segment of Client_ID before "." (Gett Business bundle id). */
export function resolveGettPartnerId(clientId: string, explicitPartnerId: string): string {
  const trimmed = explicitPartnerId.trim();
  if (trimmed) return trimmed;
  const idx = clientId.indexOf(".");
  if (idx > 0) return clientId.slice(0, idx).trim();
  return "";
}

/**
 * Demand Partner `/v1/oauth/token` often registers only the partner UUID, not the portal "bundle"
 * `partnerUuid.rest` — sending the full bundle as client_id yields invalid_client.
 */
export function resolveDemandOAuthClientId(rawClientId: string): string {
  const explicit = (process.env.GETT_DEMAND_OAUTH_CLIENT_ID ?? "").trim();
  if (explicit) return explicit;
  if ((process.env.GETT_DEMAND_OAUTH_USE_FULL_CLIENT_ID ?? "").trim().toLowerCase() === "true") {
    return rawClientId.trim();
  }
  const trimmed = rawClientId.trim();
  const dot = trimmed.indexOf(".");
  if (dot > 0) return trimmed.slice(0, dot).trim();
  return trimmed;
}

export type GettDemandOAuthAuthMode = "body" | "basic";

export function getGettDemandOAuthAuthMode(): GettDemandOAuthAuthMode {
  const v = (process.env.GETT_DEMAND_OAUTH_AUTH ?? "").trim().toLowerCase();
  return v === "basic" ? "basic" : "body";
}

/** Credentials from the Business portal use JSON OAuth on business-api — full bundle client_id. */
export function getGettIntegrationFlavor(): GettIntegrationFlavor {
  const explicit = (process.env.GETT_USE_BUSINESS_API ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return "demand_partner";
  if (explicit === "true" || explicit === "1") return "business";
  const base = (process.env.GETT_API_BASE_URL ?? "").trim();
  if (base.includes("business-api.gett.com")) return "business";
  return "demand_partner";
}

export function resolveDemandApiBaseUrlFromEnv(options: {
  gettDemandApiBaseUrl: string;
  gettApiBaseUrl: string;
}): string {
  const explicit = options.gettDemandApiBaseUrl.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const base = options.gettApiBaseUrl.trim().replace(/\/$/, "");
  if (base.includes("business-api.gett.com")) return "https://api.gett.com";
  return base || "https://api.gett.com";
}

/** @deprecated Use resolveDemandApiBaseUrlFromEnv — kept for older call sites */
export function resolveDemandPartnerApiBaseUrl(options: {
  gettApiBaseUrl: string;
  usesBusinessOAuth: boolean;
  explicitDemandUrl: string;
}): string {
  return resolveDemandApiBaseUrlFromEnv({
    gettDemandApiBaseUrl: options.explicitDemandUrl,
    gettApiBaseUrl: options.gettApiBaseUrl,
  });
}

function resolveBusinessApiBaseUrl(): string {
  return (process.env.GETT_BUSINESS_API_BASE_URL ?? "").trim().replace(/\/$/, "") || "https://business-api.gett.com";
}

function resolveDemandApiBaseUrl(): string {
  return resolveDemandApiBaseUrlFromEnv({
    gettDemandApiBaseUrl: process.env.GETT_DEMAND_API_BASE_URL ?? "",
    gettApiBaseUrl: process.env.GETT_API_BASE_URL ?? "",
  });
}

type GettConfig = {
  flavor: GettIntegrationFlavor;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  demandClientId: string;
  demandClientSecret: string;
  partnerId: string;
  reportsOrdersByPeriodUrl: string | null;
};

let tokenCache: { token: string; expiresAt: number; oauthKey: string } | null = null;

/** Cached company UUID derived from JWT (must match ?businessId= on Business API). */
let cachedBusinessCompanyId: { oauthKey: string; companyId: string } | null = null;

/** Decode JWT payload without verifying signature (read Gett claims only). */
export function decodeJwtPayloadUnsafe(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  const segment = parts[1];
  if (!segment) return null;
  try {
    const json = globalThis.Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    try {
      const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
      const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
      const json = globalThis.Buffer.from(normalized + pad, "base64").toString("utf8");
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

const UUID_CLAIM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gett Business API JWT includes the company UUID — ?businessId= must match or API returns 403
 * "businessId doesn't match JWT's companyUUID".
 */
export function extractCompanyUuidFromGettAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayloadUnsafe(accessToken);
  if (!payload) return null;
  const keys = [
    "companyUUID",
    "company_uuid",
    "businessId",
    "business_id",
    "companyId",
    "company_id",
  ];
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (UUID_CLAIM_RE.test(s)) return s.toLowerCase();
    }
  }
  return findCompanyUuidDeep(payload);
}

/** Collect lowercase UUID-looking strings anywhere in a JSON-like tree (JWT claims). */
export function collectUuidStringsDeep(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (UUID_CLAIM_RE.test(s)) acc.add(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUuidStringsDeep(item, acc);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) collectUuidStringsDeep(v, acc);
  }
}

/** Scan JWT payload for UUID strings under keys mentioning company/business (nested). */
function findCompanyUuidDeep(record: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(record)) {
    if (/company|business/i.test(k) && typeof v === "string") {
      const s = v.trim();
      if (UUID_CLAIM_RE.test(s)) return s.toLowerCase();
    }
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const inner = findCompanyUuidDeep(v as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}

/** Broader key names Gett / IdPs may use for org id in JWT. */
function findUuidUnderOrgLikeKeys(record: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(record)) {
    if (
      /company|business|tenant|organization|org|realm|account/i.test(k) &&
      typeof v === "string"
    ) {
      const s = v.trim();
      if (UUID_CLAIM_RE.test(s)) return s.toLowerCase();
    }
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const inner = findUuidUnderOrgLikeKeys(v as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * Resolve which UUID to pass as ?businessId= — must match JWT `companyUUID`.
 * Portal `client_id` is often `partnerUuid.companyUuid`; **suffix after "." is usually the company id for ?businessId=**.
 */
export function pickBusinessCompanyUuid(accessToken: string, partnerId: string, clientId: string): string | null {
  const payload = decodeJwtPayloadUnsafe(accessToken);
  if (!payload) return null;

  const rootKeys = [
    "companyUUID",
    "company_uuid",
    "businessId",
    "business_id",
    "companyId",
    "company_id",
  ];
  for (const k of rootKeys) {
    const v = payload[k];
    if (typeof v === "string" && UUID_CLAIM_RE.test(v.trim())) return v.trim().toLowerCase();
  }

  const partnerLower = partnerId.trim().toLowerCase();
  const dot = clientId.indexOf(".");
  const firstSeg = dot > 0 ? clientId.slice(0, dot).trim().toLowerCase() : clientId.trim().toLowerCase();
  const secondSeg = dot > 0 ? clientId.slice(dot + 1).trim().toLowerCase() : "";

  const trustBundleSuffix =
    (process.env.GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX ?? "true").trim().toLowerCase() !== "false";
  if (trustBundleSuffix && secondSeg && UUID_CLAIM_RE.test(secondSeg)) {
    return secondSeg;
  }

  const orgClaim = findUuidUnderOrgLikeKeys(payload);
  if (orgClaim) return orgClaim;

  const all = new Set<string>();
  collectUuidStringsDeep(payload, all);

  const suffixInJwt = secondSeg && UUID_CLAIM_RE.test(secondSeg) && all.has(secondSeg);
  const prefixInJwt = firstSeg && UUID_CLAIM_RE.test(firstSeg) && all.has(firstSeg);

  const mode = (process.env.GETT_BUSINESS_ID_FROM_CLIENT ?? "auto").trim().toLowerCase();
  if (mode === "bundle_suffix") {
    return secondSeg && UUID_CLAIM_RE.test(secondSeg) ? secondSeg : partnerLower || null;
  }
  if (mode === "bundle_prefix") {
    return prefixInJwt ? firstSeg : partnerLower || null;
  }

  if (suffixInJwt) return secondSeg;
  if (partnerLower && all.has(partnerLower)) return partnerLower;
  const others = [...all].filter((u) => u !== partnerLower && (!firstSeg || u !== firstSeg));
  if (others.length === 1) return others[0];

  const nested = findCompanyUuidDeep(payload);
  if (nested) return nested;

  if (prefixInJwt && firstSeg !== partnerLower) return firstSeg;
  if (all.size >= 1) return [...all][0];
  return null;
}

function getGettConfig(): GettConfig {
  const clientId = (process.env.GETT_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GETT_CLIENT_SECRET ?? "").trim();
  const demandClientId = (process.env.GETT_DEMAND_CLIENT_ID ?? "").trim() || clientId;
  const demandClientSecret = (process.env.GETT_DEMAND_CLIENT_SECRET ?? "").trim() || clientSecret;
  const partnerId = resolveGettPartnerId(clientId, process.env.GETT_PARTNER_ID ?? "");
  const flavor = getGettIntegrationFlavor();
  const apiBaseUrl =
    flavor === "business" ? resolveBusinessApiBaseUrl() : resolveDemandApiBaseUrl();
  const reportsOrdersByPeriodUrl = (process.env.GETT_REPORTS_ORDERS_BY_PERIOD_URL ?? "").trim() || null;
  if (!clientId || !clientSecret || !partnerId) {
    throw new Error(
      "GETT_CLIENT_ID and GETT_CLIENT_SECRET are required; set GETT_PARTNER_ID or use a Client_ID with a partner prefix (before the first dot).",
    );
  }
  return {
    flavor,
    apiBaseUrl,
    clientId,
    clientSecret,
    demandClientId,
    demandClientSecret,
    partnerId,
    reportsOrdersByPeriodUrl,
  };
}

function demandOAuthScope(): string {
  return (process.env.GETT_DEMAND_OAUTH_SCOPE ?? "").trim() || "demand_partner";
}

/** Default includes `order` — required for products, price-estimate, create/cancel order per Gett Business API docs. */
function businessOAuthScope(): string {
  return (process.env.GETT_OAUTH_SCOPE ?? "").trim() || "order finance";
}

function resolveBusinessOAuthClientId(cfg: GettConfig): string {
  return (process.env.GETT_BUSINESS_OAUTH_CLIENT_ID ?? "").trim() || cfg.clientId;
}

function oauthCacheKey(cfg: GettConfig): string {
  if (cfg.flavor === "business") {
    const cid = resolveBusinessOAuthClientId(cfg);
    return `business|${cfg.apiBaseUrl}|${cid}|${businessOAuthScope()}`;
  }
  const oauthId = resolveDemandOAuthClientId(cfg.demandClientId);
  return `demand|${cfg.apiBaseUrl}|${oauthId}|${demandOAuthScope()}|${getGettDemandOAuthAuthMode()}`;
}

async function getDemandBearerToken(cfg: GettConfig): Promise<string> {
  const scope = demandOAuthScope();
  const oauthClientId = resolveDemandOAuthClientId(cfg.demandClientId);
  const authMode = getGettDemandOAuthAuthMode();

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  let body: URLSearchParams;
  if (authMode === "basic") {
    const credentials = globalThis.Buffer.from(`${oauthClientId}:${cfg.demandClientSecret}`, "utf8").toString("base64");
    headers.Authorization = `Basic ${credentials}`;
    body = new URLSearchParams({
      grant_type: "client_credentials",
      scope,
    });
  } else {
    body = new URLSearchParams({
      client_id: oauthClientId,
      client_secret: cfg.demandClientSecret,
      grant_type: "client_credentials",
      scope,
    });
  }

  const response = await fetch(`${cfg.apiBaseUrl}/v1/oauth/token`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gett auth failed (${response.status}): ${text || response.statusText}`);
  }
  const json = (await response.json()) as GettTokenResponse;
  const token = (json.access_token ?? "").trim();
  if (!token) throw new Error("Gett auth did not return access_token.");
  const ttlSec = typeof json.expires_in === "number" ? json.expires_in : 3600;
  tokenCache = {
    token,
    oauthKey: oauthCacheKey(cfg),
    expiresAt: Date.now() + Math.max(60, ttlSec - 60) * 1000,
  };
  return token;
}

async function requestBusinessOAuthToken(
  cfg: GettConfig,
  clientId: string,
  bodyStyle: "json" | "form",
  scope: string,
): Promise<Response> {
  const url = `${cfg.apiBaseUrl}/oauth/token`;
  if (bodyStyle === "json") {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: cfg.clientSecret,
        scope,
      }),
      cache: "no-store",
    });
  }
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: cfg.clientSecret,
      scope,
    }),
    cache: "no-store",
  });
}

/**
 * Business portal OAuth: JSON body is the documented default; some tenants accept form-urlencoded.
 * `invalid_client` is usually wrong secret for this Client_ID (secret must be copied when Client_ID changes).
 */
async function getBusinessBearerToken(cfg: GettConfig): Promise<string> {
  const scope = businessOAuthScope();
  const oauthFull = resolveBusinessOAuthClientId(cfg);
  const clientIdVariants = [oauthFull];
  if (
    cfg.partnerId &&
    oauthFull.includes(".") &&
    oauthFull.trim().toLowerCase() !== cfg.partnerId.trim().toLowerCase()
  ) {
    clientIdVariants.push(cfg.partnerId.trim());
  }

  let lastStatus = 0;
  let lastText = "";
  for (const clientId of clientIdVariants) {
    for (const bodyStyle of ["json", "form"] as const) {
      const response = await requestBusinessOAuthToken(cfg, clientId, bodyStyle, scope);
      lastStatus = response.status;
      if (!response.ok) {
        lastText = await response.text().catch(() => "");
        continue;
      }
      const json = (await response.json()) as GettTokenResponse;
      const token = (json.access_token ?? "").trim();
      if (!token) continue;
      const ttlSec = typeof json.expires_in === "number" ? json.expires_in : 3600;
      tokenCache = {
        token,
        oauthKey: oauthCacheKey(cfg),
        expiresAt: Date.now() + Math.max(60, ttlSec - 60) * 1000,
      };
      return token;
    }
  }

  const hint =
    "invalid_client usually means GETT_CLIENT_SECRET does not belong to this GETT_CLIENT_ID — open Gett Business integrations, copy the secret shown with **this** Client ID (secrets change when you rotate credentials). " +
    `Tried: POST ${cfg.apiBaseUrl}/oauth/token (JSON + form), client_id bundle and partner UUID. Scope: "${scope}". ` +
    "For rides on api.gett.com only, set GETT_USE_BUSINESS_API=false and use Demand Partner credentials from Gett.";
  throw new Error(`Gett auth failed (${lastStatus}): ${lastText || "no body"}. ${hint}`);
}

async function getBearerToken(): Promise<string> {
  const cfg = getGettConfig();
  const cacheKey = oauthCacheKey(cfg);
  if (tokenCache && Date.now() < tokenCache.expiresAt && tokenCache.oauthKey === cacheKey) {
    return tokenCache.token;
  }
  if (cfg.flavor === "business") {
    return getBusinessBearerToken(cfg);
  }
  return getDemandBearerToken(cfg);
}

async function resolveBusinessCompanyId(cfg: GettConfig): Promise<string> {
  const explicit = (process.env.GETT_BUSINESS_ID ?? "").trim();
  if (explicit) return explicit;
  const cacheKey = oauthCacheKey(cfg);
  if (cachedBusinessCompanyId?.oauthKey === cacheKey) {
    return cachedBusinessCompanyId.companyId;
  }
  const token = await getBearerToken();
  /** Must match the Client_ID sent to `/oauth/token` (may differ from GETT_CLIENT_ID when GETT_BUSINESS_OAUTH_CLIENT_ID is set). */
  const oauthClientId = resolveBusinessOAuthClientId(cfg);
  const fromJwt =
    extractCompanyUuidFromGettAccessToken(token) ??
    pickBusinessCompanyUuid(token, cfg.partnerId, oauthClientId);
  const resolved = (fromJwt ?? cfg.partnerId).trim();
  cachedBusinessCompanyId = { oauthKey: cacheKey, companyId: resolved };
  return resolved;
}

/**
 * Calls Gett OAuth, then resolves the `businessId` used for `?businessId=` (Business API) — same as order/quote code.
 * For debugging: run `npx tsx scripts/gett-resolve-business-id.ts` (loads `.env.local`).
 */
export async function fetchGettBusinessIdDiagnostics(): Promise<{
  flavor: GettIntegrationFlavor;
  /** Resolved `?businessId=` for Business API (null when Demand Partner flavor — use `partnerId`). */
  businessApiBusinessId: string | null;
  explicitEnvOverride: boolean;
  partnerId: string;
  oauthClientId: string;
  jwtCompanyUuidClaim: string | null;
  pickedFromClientIdBundle: string | null;
}> {
  const cfg = getGettConfig();
  const explicitEnvOverride = Boolean((process.env.GETT_BUSINESS_ID ?? "").trim());
  const token = await getBearerToken();
  const oauthClientId = resolveBusinessOAuthClientId(cfg);
  const jwtCompanyUuidClaim = extractCompanyUuidFromGettAccessToken(token);
  const pickedFromClientIdBundle = pickBusinessCompanyUuid(token, cfg.partnerId, oauthClientId);
  const businessApiBusinessId = cfg.flavor === "business" ? await resolveBusinessCompanyId(cfg) : null;
  return {
    flavor: cfg.flavor,
    businessApiBusinessId,
    explicitEnvOverride,
    partnerId: cfg.partnerId,
    oauthClientId,
    jwtCompanyUuidClaim,
    pickedFromClientIdBundle,
  };
}

function normalizeRiderPhone(phone: string): string {
  return phone.replace(/\s+/g, "").replace(/^\+/, "");
}

async function gettFetchJson<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
  const cfg = getGettConfig();
  const token = await getBearerToken();
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = isAbsolute ? pathOrUrl : `${cfg.apiBaseUrl}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gett request failed (${response.status}): ${text || response.statusText}`);
  }
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

type BusinessTransportProduct = {
  product_id?: string;
  name?: string;
  description?: string;
  price_concept?: string;
  pricing_model?: string;
  tariff_type?: string;
};

/** Prefer meter tariff products when GETT_BUSINESS_PRICE_MODEL=meter (default). Use `any` to disable filtering. */
function filterTransportationForMeterPreference(products: BusinessTransportProduct[]): BusinessTransportProduct[] {
  const mode = (process.env.GETT_BUSINESS_PRICE_MODEL ?? "meter").trim().toLowerCase();
  if (mode === "any" || mode === "all") return products;
  const bag = (p: BusinessTransportProduct): string =>
    `${JSON.stringify(p)} ${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
  const explicitMeter = products.filter((p) => {
    const pc = [p.price_concept, p.pricing_model, p.tariff_type];
    for (const x of pc) {
      if (typeof x === "string" && x.toLowerCase().includes("meter")) return true;
    }
    return bag(p).includes("meter") || bag(p).includes("מונה");
  });
  return explicitMeter.length > 0 ? explicitMeter : products;
}

async function getGettQuoteBusiness(
  cfg: GettConfig,
  input: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
    waypoints?: GettWaypointInput[];
    scheduledAt?: string | null;
  },
): Promise<GettQuoteResponse> {
  const bid = await resolveBusinessCompanyId(cfg);
  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };
  const stops = (input.waypoints ?? []).map((w) => ({ lat: w.lat, lng: w.lng }));
  const scheduledAt = input.scheduledAt ?? undefined;

  const productsPayload = await gettFetchJson<{
    products?: { transportation?: BusinessTransportProduct[] };
  }>(`/v1/products?businessId=${encodeURIComponent(bid)}`, {
    method: "POST",
    body: JSON.stringify({
      origin,
      destination,
      scheduled_at: scheduledAt,
    }),
  });

  let transportation = productsPayload.products?.transportation ?? [];
  transportation = filterTransportationForMeterPreference(transportation);
  if (!Array.isArray(transportation) || transportation.length === 0) {
    return { status: "success", data: { products: [] } };
  }

  const quoteProducts: GettQuoteProduct[] = [];
  const maxProducts = 20;
  for (const p of transportation.slice(0, maxProducts)) {
    const pid = String(p.product_id ?? "").trim();
    if (!pid) continue;
    try {
      const est = await gettFetchJson<{
        quote_id?: string;
        currency_code?: string;
        price?: { value?: string; include_tax?: boolean };
      }>(`/v1/price-estimate?businessId=${encodeURIComponent(bid)}`, {
        method: "POST",
        body: JSON.stringify({
          origin,
          stops,
          destination,
          product_id: pid,
          scheduled_at: scheduledAt,
        }),
      });
      const qid = String(est.quote_id ?? "").trim();
      const formatted = est.price?.value != null ? String(est.price.value) : "";
      quoteProducts.push({
        id: pid,
        name: String(p.name ?? pid),
        quote_id: qid,
        availability: qid ? "available" : "unavailable",
        price: { formatted, currency: est.currency_code },
      });
    } catch {
      quoteProducts.push({
        id: pid,
        name: String(p.name ?? pid),
        availability: "unavailable",
      });
    }
  }

  const firstQuote = quoteProducts.find((row) => row.quote_id);
  return {
    status: "success",
    data: {
      products: quoteProducts,
      estimation_id: firstQuote?.quote_id,
    },
  };
}

export async function getGettQuote(input: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  waypoints?: GettWaypointInput[];
  scheduledAt?: string | null;
}) {
  const cfg = getGettConfig();
  if (cfg.flavor === "business") {
    return getGettQuoteBusiness(cfg, input);
  }

  const stops = [
    { type: "origin", location: { lat: input.originLat, lng: input.originLng } },
    ...((input.waypoints ?? []).map((waypoint) => ({
      type: "on_going" as const,
      location: { lat: waypoint.lat, lng: waypoint.lng },
    })) ?? []),
    { type: "destination", location: { lat: input.destinationLat, lng: input.destinationLng } },
  ];
  return gettFetchJson<GettQuoteResponse>(
    `/v1/private/preorder/aggregated?partner_id=${encodeURIComponent(cfg.partnerId)}`,
    {
      method: "POST",
      body: JSON.stringify({
        stops,
        scheduled_at: input.scheduledAt ?? undefined,
        category: "transportation",
        locale: "en",
        payment_type: "cash",
      }),
    },
  );
}

function businessLocation(lat: number, lng: number, fullAddress: string) {
  return {
    lat,
    lng,
    address: { full_address: fullAddress },
  };
}

export async function createGettOrder(input: {
  productId: string;
  quoteId: string;
  userName: string;
  userPhone: string;
  originLat: number;
  originLng: number;
  originAddress: string;
  destinationLat: number;
  destinationLng: number;
  destinationAddress: string;
  waypoints?: Array<{
    lat: number;
    lng: number;
    address: string;
  }>;
  scheduledAt?: string | null;
}) {
  const cfg = getGettConfig();
  const phone = normalizeRiderPhone(input.userPhone);

  if (cfg.flavor === "business") {
    const bid = await resolveBusinessCompanyId(cfg);
    const midStops =
      input.waypoints?.map((waypoint) => ({
        type: "on_going" as const,
        actions: [{ type: "stop_by" as const, user: { name: input.userName, phone } }],
        location: businessLocation(waypoint.lat, waypoint.lng, waypoint.address),
      })) ?? [];
    const raw = await gettFetchJson<Record<string, unknown>>(`/v1/orders?businessId=${encodeURIComponent(bid)}`, {
      method: "POST",
      body: JSON.stringify({
        category: "transportation",
        product_id: input.productId,
        scheduled_at: input.scheduledAt ?? undefined,
        quote_id: input.quoteId,
        stops: [
          {
            type: "origin",
            actions: [{ type: "pick_up", user: { name: input.userName, phone } }],
            location: businessLocation(input.originLat, input.originLng, input.originAddress),
          },
          ...midStops,
          {
            type: "destination",
            actions: [{ type: "drop_off", user: { name: input.userName, phone } }],
            location: businessLocation(input.destinationLat, input.destinationLng, input.destinationAddress),
          },
        ],
      }),
    });
    const orderId = raw.id != null ? String(raw.id) : "";
    return {
      status: "success",
      order: { id: orderId },
    } as {
      status?: string;
      order?: { id?: string };
      ride_request_id?: string;
    };
  }

  const midStops =
    input.waypoints?.map((waypoint) => ({
      type: "on_going" as const,
      actions: [{ type: "stop_by", user: { name: input.userName, phone: input.userPhone } }],
      location: { lat: waypoint.lat, lng: waypoint.lng, full_address: waypoint.address },
    })) ?? [];
  return gettFetchJson<{
    status?: string;
    order?: { id?: string };
    ride_request_id?: string;
  }>("/v1/private/orders/create", {
    method: "POST",
    body: JSON.stringify({
      partner_id: cfg.partnerId,
      product_id: input.productId,
      quote_id: input.quoteId,
      user_accepted_terms_and_privacy: true,
      category: "transportation",
      lc: "en",
      scheduled_at: input.scheduledAt ?? undefined,
      stops: [
        {
          type: "origin",
          actions: [{ type: "pick_up", user: { name: input.userName, phone: input.userPhone } }],
          location: { lat: input.originLat, lng: input.originLng, full_address: input.originAddress },
        },
        ...midStops,
        {
          type: "destination",
          actions: [{ type: "drop_off", user: { name: input.userName, phone: input.userPhone } }],
          location: {
            lat: input.destinationLat,
            lng: input.destinationLng,
            full_address: input.destinationAddress,
          },
        },
      ],
      payment: { payment_type: "cash" },
      preferences: { num_of_passengers: 1, num_of_suitcases: 1 },
    }),
  });
}

export async function getGettOrder(orderId: string) {
  const cfg = getGettConfig();
  if (cfg.flavor === "business") {
    const bid = await resolveBusinessCompanyId(cfg);
    const raw = await gettFetchJson<Record<string, unknown>>(
      `/v1/orders/${encodeURIComponent(orderId)}?businessId=${encodeURIComponent(bid)}`,
      { method: "GET" },
    );
    const status = raw.status != null ? String(raw.status) : "Unknown";
    const scheduled = raw.scheduled_at != null ? String(raw.scheduled_at) : undefined;
    const mapped: GettOrderResponse = {
      order: {
        order_id: String(raw.id ?? orderId),
        status,
        scheduled_at: scheduled,
        created_at: raw.requested_at != null ? String(raw.requested_at) : undefined,
      },
    };
    return mapped;
  }

  return gettFetchJson<GettOrderResponse>(
    `/v1/private/orders/${encodeURIComponent(orderId)}?partner_id=${encodeURIComponent(cfg.partnerId)}`,
    { method: "GET" },
  );
}

export async function cancelGettOrder(orderId: string) {
  const cfg = getGettConfig();
  if (cfg.flavor === "business") {
    const bid = await resolveBusinessCompanyId(cfg);
    await gettFetchJson<unknown>(
      `/v1/orders/${encodeURIComponent(orderId)}/cancel?businessId=${encodeURIComponent(bid)}`,
      { method: "POST" },
    );
    return;
  }

  await gettFetchJson<unknown>(
    `/v1/private/orders/cancel/${encodeURIComponent(orderId)}?partner_id=${encodeURIComponent(cfg.partnerId)}`,
    { method: "POST" },
  );
}

export async function listGettOrdersByPeriod(input: { fromIso: string; toIso: string }) {
  const cfg = getGettConfig();
  if (!cfg.reportsOrdersByPeriodUrl) return [] as GettOrderListItem[];
  const sep = cfg.reportsOrdersByPeriodUrl.includes("?") ? "&" : "?";
  const url = `${cfg.reportsOrdersByPeriodUrl}${sep}from=${encodeURIComponent(input.fromIso)}&to=${encodeURIComponent(input.toIso)}`;
  const json = await gettFetchJson<{ orders?: Array<Record<string, unknown>> }>(url, { method: "GET" });
  const rows = Array.isArray(json.orders) ? json.orders : [];
  return rows.map(mapGettOrderRow).filter((row) => row.orderId);
}
