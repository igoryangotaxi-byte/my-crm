import type {
  B2BDashboardOrder,
  B2BOrderDetailsResponse,
  PreOrder,
  RequestRideLifecycleStatus,
  RequestRidePayload,
  RequestRideResult,
  RequestRideStatus,
  RequestRideUserSuggestion,
  TokenDiagnostics,
  YangoApiClientRef,
} from "@/types/crm";
import { b2bDashboardOrderKey, type B2BOrdersListCursors } from "@/lib/b2b-orders-keys";
import {
  listMappedPhonesForClient,
  normalizePhoneKey,
  resolveMappedUserId,
  searchMappedUsers,
  upsertMappedUserId,
} from "@/lib/request-rides-user-map";
import {
  finishPreOrderFallbackAttempt,
  getPreOrderFallbackSnapshot,
  listPreOrderFallbackSnapshotsByScope,
  tryStartPreOrderFallbackAttempt,
} from "@/lib/preorder-fallback-store";
import {
  loadYangoTokenRegistry,
  normalizeYangoTokenRegistryLabel,
} from "@/lib/yango-token-registry";
import { loadAuthStore } from "@/lib/auth-store";
import { unstable_cache } from "next/cache";

const YANGO_BASE_URL = "https://b2b-api.yango.com/integration";
const ORDERS_PAGE_LIMIT = 100;
const PREORDERS_CACHE_REVALIDATE_SECONDS = 30;
const B2B_DASHBOARD_CACHE_REVALIDATE_SECONDS = 60;
const DASHBOARD_REPORT_CHUNK_CONCURRENCY = Number(
  process.env.YANGO_DASHBOARD_REPORT_CONCURRENCY ?? "3",
);
const DASHBOARD_LOCAL_CACHE_TTL_MS = B2B_DASHBOARD_CACHE_REVALIDATE_SECONDS * 1000;

function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

type TokenConfig = {
  label: string;
  token: string;
  crmClientName?: string;
};

function readToken(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) return normalized;
  }
  return "";
}

/**
 * How static `YANGO_TOKEN_*` env and KV `appli:yango:token-registry:v1` combine for the same cabinet
 * (after `normalizeYangoTokenRegistryLabel`). Default `registry` matches historical prod: registry row wins when both exist.
 * Set `YANGO_TOKEN_REGISTRY_PRECEDENCE=env` locally if you reuse prod KV but keep different tokens only in `.env.local`.
 */
function yangoTokenRegistryPrecedence(): "registry" | "env" {
  const raw = (process.env.YANGO_TOKEN_REGISTRY_PRECEDENCE ?? "registry").trim().toLowerCase();
  return raw === "env" ? "env" : "registry";
}

type YangoClient = {
  client_id: string;
  name: string;
};

type YangoOrderPoint = {
  fullname?: string;
};

type YangoOrder = {
  id: string;
  status?: string;
  created_at?: string;
  created_time?: string;
  created_datetime?: string;
  local_created_datetime?: string;
  creation_date?: string;
  due_date?: string;
  source?: YangoOrderPoint;
  destination?: YangoOrderPoint;
};

type YangoOrderListResponse = {
  items?: YangoOrder[];
  total_amount?: number;
};

type YangoAuthListResponse = {
  clients?: YangoClient[];
};

type YangoVehicle = {
  model?: string;
  car_model?: string;
  brand?: string;
  car_brand?: string;
  manufacturer?: string;
  licence_plate?: string;
  license_plate?: string;
  plates?: string;
  number?: string;
  car_number?: string;
};

type YangoPerformer = {
  id?: string;
  fullname?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  firstname?: string;
  lastname?: string;
  vehicle?: YangoVehicle;
  car?: YangoVehicle;
};

type YangoOrderInfoResponse = {
  performer?: YangoPerformer;
  cost?: number;
  cost_with_vat?: number;
  total_cost?: number;
  created_at?: string;
  created_time?: string;
  created_datetime?: string;
  local_created_datetime?: string;
  status?: string;
  estimated_waiting?: number;
  estimated_waiting_time?: number;
  waiting_time?: number;
};

type YangoRideStatus = {
  value?: string;
  text?: string;
};

type YangoTaxiReportOrder = {
  id: string;
  due_datetime?: string;
  local_due_datetime?: string;
  source_fullname?: string;
  destination_fullname?: string;
  total_cost?: number;
  cost_w_vat?: number;
  cost?: number;
  ride_cost?: number;
  ride_status?: YangoRideStatus;
};

type YangoOrderProgressResponse = {
  status?: string;
  status_text?: string;
  eta_minutes?: number;
  expected_waiting_time?: number;
  performer?: YangoPerformer;
};

type YangoTaxiReportResponse = {
  orders?: YangoTaxiReportOrder[];
};

/** Read tokens per call so new Vercel env + cache bust work; avoid module-init snapshot on warm serverless. */
function getStaticTokenConfigs(): TokenConfig[] {
  return [
    {
      label: "COFIX",
      token: readToken(process.env.YANGO_TOKEN_COFIX, process.env.YANGO_TOKEN_SAMELET),
    },
    {
      label: "SHUFERSAL",
      token: readToken(process.env.YANGO_TOKEN_SHUFERSAL),
    },
    {
      label: "TEST CABINET",
      crmClientName: "TEST CABINET",
      token: readToken(process.env.YANGO_TOKEN_TEST_CABINET, process.env.YANGO_TOKEN_APLI_TAXI_OZ),
    },
    {
      label: "SHANA10",
      crmClientName: "SHANA10",
      token: readToken(process.env.YANGO_TOKEN_SHANA10),
    },
    {
      label: "TELAVIVMUNICIPALITY",
      crmClientName: "TelAvivMunicipality",
      token: readToken(process.env.YANGO_TOKEN_TEL_AVIV_MUNICIPALITY),
    },
    {
      label: "YANGODELI",
      crmClientName: "YangoDeli",
      token: readToken(process.env.YANGO_TOKEN_YANGO_DELI),
    },
    {
      label: "SHLAV",
      crmClientName: "SHLAV",
      token: readToken(process.env.YANGO_TOKEN_SHLAV),
    },
    {
      label: "SAMLET_MOTORS",
      crmClientName: "סמלת מוטורס",
      token: readToken(process.env.YANGO_TOKEN_SAMLET_MOTORS),
    },
    {
      label: "HAMOSHAVA_20",
      crmClientName: "המושבה 20 בע\"מ",
      token: readToken(process.env.YANGO_TOKEN_HAMOSHAVA_20),
    },
    {
      label: "Star Taxi Point",
      crmClientName: "Star Taxi Point",
      token: readToken(process.env.YANGO_TOKEN_STAR_TAXI_POINT),
    },
    {
      label: "OPTICITY",
      crmClientName: "Opticity",
      token: readToken(process.env.YANGO_TOKEN_OPTICITY),
    },
    {
      label: "ZHAK",
      crmClientName: "ZHAK",
      token: readToken(process.env.YANGO_TOKEN_ZHAK),
    },
  ];
}

async function getTokenConfigs(): Promise<TokenConfig[]> {
  const staticEntries = getStaticTokenConfigs();
  const dynamicEntries = await loadYangoTokenRegistry();
  if (dynamicEntries.length === 0) {
    return staticEntries;
  }

  /** Dedupe static vs KV by normalized label (e.g. `Star Taxi Point` and `STAR_TAXI_POINT` → one cabinet). */
  const precedence = yangoTokenRegistryPrecedence();
  const byNormKey = new Map<string, TokenConfig>();
  for (const row of staticEntries) {
    byNormKey.set(normalizeYangoTokenRegistryLabel(row.label), { ...row });
  }
  for (const row of dynamicEntries) {
    const key = normalizeYangoTokenRegistryLabel(row.label);
    const prev = byNormKey.get(key);
    const fromRegistry = (row.token ?? "").trim();
    const envToken = (prev?.token ?? "").trim();
    const token =
      precedence === "env" ? envToken || fromRegistry : fromRegistry || envToken;
    byNormKey.set(key, {
      label: (prev?.label ?? "").trim() || row.label,
      crmClientName:
        (prev?.crmClientName ?? "").trim() || (row.crmClientName ?? "").trim() || row.crmClientName,
      token,
    });
  }

  return [...byNormKey.values()];
}

let dashboardInMemoryCache:
  | {
      updatedAt: number;
      payload: { rows: B2BDashboardOrder[]; errors: string[] };
    }
  | null = null;
let dashboardInFlight: Promise<{ rows: B2BDashboardOrder[]; errors: string[] }> | null = null;

async function fetchJson<T>(
  url: string,
  token: string,
  clientId?: string,
  init?: RequestInit,
) {
  const buildTraceSuffix = (response: Response): string => {
    const traceId =
      response.headers.get("x-trace-id") ??
      response.headers.get("x-traceid") ??
      response.headers.get("trace-id");
    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("request-id") ??
      response.headers.get("x-correlation-id");
    const parts = [
      traceId ? `trace_id=${traceId}` : null,
      requestId ? `request_id=${requestId}` : null,
    ].filter(Boolean);
    return parts.length ? ` [${parts.join(", ")}]` : "";
  };

  const extraHeaders = (init?.headers ?? {}) as HeadersInit;
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(clientId ? { "X-YaTaxi-Selected-Corp-Client-Id": clientId } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: init?.body,
    next: { revalidate: PREORDERS_CACHE_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status}: ${message}${buildTraceSuffix(response)}`);
  }

  return (await response.json()) as T;
}

async function fetchJsonNoCache<T>(
  url: string,
  token: string,
  clientId?: string,
  init?: RequestInit,
  options?: { allowEmptyBody?: boolean },
) {
  const buildTraceSuffix = (response: Response): string => {
    const traceId =
      response.headers.get("x-trace-id") ??
      response.headers.get("x-traceid") ??
      response.headers.get("trace-id");
    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("request-id") ??
      response.headers.get("x-correlation-id");
    const parts = [
      traceId ? `trace_id=${traceId}` : null,
      requestId ? `request_id=${requestId}` : null,
    ].filter(Boolean);
    return parts.length ? ` [${parts.join(", ")}]` : "";
  };

  const extraHeaders = (init?.headers ?? {}) as HeadersInit;
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(clientId ? { "X-YaTaxi-Selected-Corp-Client-Id": clientId } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: init?.body,
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${raw}${buildTraceSuffix(response)}`);
  }

  if (options?.allowEmptyBody && !raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    if (options?.allowEmptyBody) {
      return {} as T;
    }
    throw new Error(`Invalid JSON in Yango response: ${raw.slice(0, 200)}`);
  }
}

function isCompletedStatus(rawStatus?: string) {
  const status = (rawStatus ?? "").toLowerCase();
  return (
    status === "complete" ||
    status === "completed" ||
    status === "finished" ||
    status === "transporting_finished"
  );
}

function isCancelledStatus(rawStatus?: string) {
  const status = (rawStatus ?? "").toLowerCase();
  return status.includes("cancel");
}

function isInProgressStatus(rawStatus?: string) {
  const status = (rawStatus ?? "").toLowerCase();
  return (
    status.includes("search") ||
    status.includes("driving") ||
    status.includes("transporting") ||
    status.includes("arrived") ||
    status.includes("accepted") ||
    status.includes("in_progress")
  );
}

function normalizeDashboardStatus(
  rawStatus?: string,
  scheduledAt?: string,
): "completed" | "cancelled" | "pending" | "in_progress" {
  if (isCompletedStatus(rawStatus)) {
    return "completed";
  }

  if (isCancelledStatus(rawStatus)) {
    return "cancelled";
  }

  if (isInProgressStatus(rawStatus)) {
    return "in_progress";
  }

  const scheduledTs = scheduledAt ? new Date(scheduledAt).getTime() : Number.NaN;
  if (!Number.isNaN(scheduledTs) && scheduledTs > Date.now()) {
    return "pending";
  }

  return "pending";
}

function splitDriverFullName(fullname?: string) {
  if (!fullname) {
    return { firstName: null, lastName: null };
  }

  const parts = fullname.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function formatDateTime(input?: string) {
  if (!input) {
    return "Not available";
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function formatClientPrice(orderInfo?: YangoOrderInfoResponse) {
  const value =
    orderInfo?.total_cost ?? orderInfo?.cost_with_vat ?? orderInfo?.cost;

  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Price n/a";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function getCreatedAtText(orderInfo: YangoOrderInfoResponse | undefined, dueDate?: string) {
  const createdAtRaw =
    orderInfo?.created_at ??
    orderInfo?.created_time ??
    orderInfo?.created_datetime ??
    orderInfo?.local_created_datetime;

  if (!createdAtRaw) {
    return "Not provided by API";
  }

  if (dueDate) {
    const createdTs = new Date(createdAtRaw).getTime();
    const dueTs = new Date(dueDate).getTime();

    if (!Number.isNaN(createdTs) && !Number.isNaN(dueTs) && createdTs === dueTs) {
      return "Not provided by API";
    }
  }

  return formatDateTime(createdAtRaw);
}

function isFutureDate(input?: string) {
  if (!input) {
    return false;
  }

  const date = new Date(input);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function getSinceDateTime() {
  const now = new Date(Date.now() - 60 * 1000);
  return now.toISOString();
}

async function getOrderDetails(
  tokenConfig: TokenConfig,
  clientId: string,
  orderId: string,
) {
  try {
    return await fetchJson<YangoOrderInfoResponse>(
      `${YANGO_BASE_URL}/2.0/orders/info?order_id=${orderId}`,
      tokenConfig.token,
      clientId,
    );
  } catch {
    return undefined;
  }
}

async function getClientPreOrders(tokenConfig: TokenConfig, client: YangoClient) {
  const preOrders: PreOrder[] = [];
  let offset = 0;
  const limit = ORDERS_PAGE_LIMIT;
  const sinceDateTime = getSinceDateTime();

  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      sorting_field: "due_date",
      sorting_direction: "1",
      since_datetime: sinceDateTime,
    });

    const response = await fetchJson<YangoOrderListResponse>(
      `${YANGO_BASE_URL}/2.0/orders/list?${params.toString()}`,
      tokenConfig.token,
      client.client_id,
    );

    const items = response.items ?? [];
    if (items.length === 0) {
      break;
    }

    const futureOrders = items.filter((order) => {
      if (!isFutureDate(order.due_date)) {
        return false;
      }
      // Hide already active/completed/cancelled rides from Pre-Orders
      // so they appear in Orders with the correct lifecycle status.
      if (
        isInProgressStatus(order.status) ||
        isCompletedStatus(order.status) ||
        isCancelledStatus(order.status)
      ) {
        return false;
      }
      return true;
    });

    const orderDetailsList = await Promise.all(
      futureOrders.map((order) =>
        getOrderDetails(tokenConfig, client.client_id, order.id),
      ),
    );

    for (const [index, order] of futureOrders.entries()) {
      const orderDetails: YangoOrderInfoResponse | undefined =
        orderDetailsList[index];
      persistUserMapFromApiPayload(
        { tokenLabel: tokenConfig.label, clientId: client.client_id },
        orderDetails ?? null,
      );
      const performer: YangoPerformer | undefined = orderDetails?.performer;
      const names = splitDriverFullName(performer?.fullname);

      preOrders.push({
        id: `${tokenConfig.label}-${order.id}`,
        tokenLabel: tokenConfig.label,
        clientId: client.client_id,
        orderId: order.id,
        orderStatus: order.status,
        clientPrice: formatClientPrice(orderDetails),
        clientName: tokenConfig.crmClientName ?? client.name,
        requestedAt: getCreatedAtText(orderDetails, order.due_date),
        scheduledFor: formatDateTime(order.due_date),
        scheduledAt: order.due_date,
        pointA: order.source?.fullname ?? "Not available",
        pointB: order.destination?.fullname ?? "Not available",
        driverAssigned: Boolean(performer?.fullname || performer?.phone || performer?.id),
        driverId: performer?.id ?? null,
        driverFirstName: names.firstName,
        driverLastName: names.lastName,
        driverPhone: performer?.phone ?? null,
      });
    }

    offset += items.length;
    const reportedTotal =
      typeof response.total_amount === "number" && response.total_amount > 0
        ? response.total_amount
        : null;
    if (reportedTotal != null && offset >= reportedTotal) {
      break;
    }
    if (items.length < limit) {
      break;
    }
  }

  return preOrders;
}

async function loadAllYangoPreOrders(scope?: YangoScope) {
  const preOrders: PreOrder[] = [];
  const errors: string[] = [];
  const diagnostics: TokenDiagnostics[] = [];
  const tokenConfigs = await getTokenConfigs();

  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
      if (scope && tokenConfig.label !== scope.tokenLabel) return;
      if (!tokenConfig.token) {
        diagnostics.push({
          label: `${tokenConfig.label} / token`,
          tokenLabel: tokenConfig.label,
          clientId: null,
          clientName: tokenConfig.crmClientName ?? null,
          authStatus: "error",
          ordersStatus: "error",
          message: "Token is not configured.",
        });
        return;
      }

      try {
        const authResponse = await fetchJson<YangoAuthListResponse>(
          `${YANGO_BASE_URL}/2.0/auth/list`,
          tokenConfig.token,
        );

        const clients = authResponse.clients ?? [];
        if (clients.length === 0) {
          diagnostics.push({
            label: `${tokenConfig.label} / no client`,
            tokenLabel: tokenConfig.label,
            clientId: null,
            clientName: tokenConfig.crmClientName ?? null,
            authStatus: "ok",
            ordersStatus: "error",
            message: "No clients returned by auth/list",
          });
          return;
        }

        for (const client of clients) {
          if (scope && client.client_id !== scope.clientId) continue;
          try {
            const clientPreOrders = await getClientPreOrders(tokenConfig, client);
            preOrders.push(...clientPreOrders);

            diagnostics.push({
              label: `${tokenConfig.label} / ${client.client_id}`,
              tokenLabel: tokenConfig.label,
              clientId: client.client_id,
              clientName: tokenConfig.crmClientName ?? client.name,
              authStatus: "ok",
              ordersStatus: "ok",
              message: null,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unexpected error";
            const isFeatureDisabled = message.includes("features_check_failed");

            diagnostics.push({
              label: `${tokenConfig.label} / ${client.client_id}`,
              tokenLabel: tokenConfig.label,
              clientId: client.client_id,
              clientName: tokenConfig.crmClientName ?? client.name,
              authStatus: "ok",
              ordersStatus: isFeatureDisabled ? "feature_disabled" : "error",
              message,
            });

            if (!isFeatureDisabled) {
              errors.push(`${tokenConfig.label}: ${message}`);
            }
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error";

        diagnostics.push({
          label: `${tokenConfig.label} / auth`,
          tokenLabel: tokenConfig.label,
          clientId: null,
          clientName: tokenConfig.crmClientName ?? null,
          authStatus: "error",
          ordersStatus: "error",
          message,
        });

        errors.push(
          `${tokenConfig.label}: ${message}`,
        );
      }
    }),
  );

  preOrders.sort((a, b) => {
    const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
    const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
    return aTime - bTime;
  });

  const fallbackCache = new Map<string, Record<string, ReturnType<typeof getPreOrderFallbackSnapshot>>>();
  for (const row of preOrders) {
    const scopeKey = `${row.tokenLabel}:${row.clientId}`;
    if (!fallbackCache.has(scopeKey)) {
      fallbackCache.set(
        scopeKey,
        listPreOrderFallbackSnapshotsByScope({
          tokenLabel: row.tokenLabel,
          clientId: row.clientId,
        }),
      );
    }
    const scopeEntries = fallbackCache.get(scopeKey) ?? {};
    row.fallback = scopeEntries[row.orderId] ?? null;
  }

  return { preOrders, errors, diagnostics };
}

export const getAllYangoPreOrders = unstable_cache(
  loadAllYangoPreOrders,
  ["yango-preorders-v5"],
  { revalidate: PREORDERS_CACHE_REVALIDATE_SECONDS, tags: ["yango-preorders"] },
);

export async function getScopedYangoPreOrders(scope: { tokenLabel: string; clientId: string }) {
  return loadAllYangoPreOrders(scope);
}

function getDashboardDefaultRange() {
  const sinceDays = readPositiveIntEnv("YANGO_B2B_ORDERS_LIST_SINCE_DAYS", 90);
  const tillDaysAhead = readPositiveIntEnv("YANGO_B2B_ORDERS_LIST_TILL_DAYS_AHEAD", 90);
  const till = new Date();
  till.setDate(till.getDate() + tillDaysAhead);
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  return { since: since.toISOString(), till: till.toISOString() };
}

function toDateInputValueUtc(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Orders page default: **1st of this month → end of today** (local). `since`/`till` match
 * `fromDateStr`/`toDateStr` so SSR rows pass the client date filter. List is newest-first;
 * `pullB2BOrdersRows` still caps at `targetNewCount` (20 on the page).
 */
export function getB2BOrdersViewDefaultRange(): {
  since: string;
  till: string;
  fromDateStr: string;
  toDateStr: string;
} {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const today = new Date();
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  return {
    fromDateStr: toDateInputValueUtc(monthStart),
    toDateStr: toDateInputValueUtc(todayEnd),
    since: monthStart.toISOString(),
    till: todayEnd.toISOString(),
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function runChunkedWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
  if (items.length === 0) return [] as R[];
  const safeLimit = Math.max(1, Number.isFinite(limit) ? limit : 1);
  const results: R[] = [];
  for (let index = 0; index < items.length; index += safeLimit) {
    const batch = items.slice(index, index + safeLimit);
    const batchResults = await Promise.all(batch.map((item) => worker(item)));
    results.push(...batchResults);
  }
  return results;
}

export type { B2BOrdersListCursors } from "@/lib/b2b-orders-keys";
export { b2bDashboardOrderKey } from "@/lib/b2b-orders-keys";

function b2bOrdersCursorKey(tokenLabel: string, clientId: string): string {
  return `${tokenLabel}::${clientId}`;
}

async function fetchOrdersListSinglePage(
  tokenConfig: TokenConfig,
  clientId: string,
  sinceDateTime: string,
  tillDateTime: string,
  offset: number,
  limit: number,
): Promise<YangoOrderListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sorting_field: "due_date",
    /** API allows only `-1` or `1`. Default `-1` = newest `due_date` first; set `YANGO_B2B_ORDERS_LIST_SORT_DIRECTION=1` for oldest-first. */
    sorting_direction: (() => {
      const v = process.env.YANGO_B2B_ORDERS_LIST_SORT_DIRECTION?.trim();
      return v === "1" ? "1" : "-1";
    })(),
    since_datetime: sinceDateTime,
    till_datetime: tillDateTime,
  });
  return fetchJson<YangoOrderListResponse>(
    `${YANGO_BASE_URL}/2.0/orders/list?${params.toString()}`,
    tokenConfig.token,
    clientId,
  );
}

async function yangoOrderMapToB2BRows(
  tokenConfig: TokenConfig,
  client: YangoClient,
  uniqueById: Map<string, YangoOrder>,
): Promise<B2BDashboardOrder[]> {
  const orderIds = [...uniqueById.keys()];
  if (orderIds.length === 0) return [];

  const reportChunks = chunkArray(orderIds, 100);
  const reportOrdersById = new Map<string, YangoTaxiReportOrder>();

  const reports = await runChunkedWithConcurrency(
    reportChunks,
    DASHBOARD_REPORT_CHUNK_CONCURRENCY,
    async (idsChunk) => {
      try {
        return await fetchJson<YangoTaxiReportResponse>(
          `${YANGO_BASE_URL}/2.0/orders/taxi/report`,
          tokenConfig.token,
          client.client_id,
          {
            method: "POST",
            body: JSON.stringify({ ids: idsChunk }),
          },
        );
      } catch {
        return { orders: [] } as YangoTaxiReportResponse;
      }
    },
  );

  for (const report of reports) {
    for (const order of report.orders ?? []) {
      reportOrdersById.set(order.id, order);
    }
  }

  const rows: B2BDashboardOrder[] = [];

  for (const [orderId, order] of uniqueById.entries()) {
    const reportOrder = reportOrdersById.get(orderId);
    const statusRaw = reportOrder?.ride_status?.value ?? order.status ?? "unknown";
    const clientPaid =
      reportOrder?.total_cost ?? reportOrder?.cost_w_vat ?? reportOrder?.cost ?? 0;
    const driverReceived = reportOrder?.ride_cost ?? reportOrder?.cost ?? 0;
    const scheduledAt =
      order.due_date ??
      reportOrder?.local_due_datetime ??
      reportOrder?.due_datetime ??
      new Date().toISOString();
    const createdAt =
      order.created_at ??
      order.created_time ??
      order.created_datetime ??
      order.local_created_datetime ??
      order.creation_date ??
      "Not provided by API";

    rows.push({
      orderId,
      tokenLabel: tokenConfig.label,
      clientId: client.client_id,
      clientName: tokenConfig.crmClientName ?? client.name,
      status: normalizeDashboardStatus(statusRaw, scheduledAt),
      statusRaw,
      createdAt,
      scheduledAt,
      pointA: order.source?.fullname ?? reportOrder?.source_fullname ?? "Not available",
      pointB:
        order.destination?.fullname ??
        reportOrder?.destination_fullname ??
        "Not available",
      clientPaid,
      driverReceived,
      decoupling: clientPaid - driverReceived,
    });
  }

  return rows;
}

async function getClientDashboardOrders(
  tokenConfig: TokenConfig,
  client: YangoClient,
  sinceDateTime: string,
  tillDateTime: string,
) {
  const uniqueById = new Map<string, YangoOrder>();
  let offset = 0;

  while (true) {
    const response = await fetchOrdersListSinglePage(
      tokenConfig,
      client.client_id,
      sinceDateTime,
      tillDateTime,
      offset,
      ORDERS_PAGE_LIMIT,
    );

    const items = response.items ?? [];
    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      uniqueById.set(item.id, item);
    }

    offset += items.length;
    const reportedTotal =
      typeof response.total_amount === "number" && response.total_amount > 0
        ? response.total_amount
        : null;
    if (reportedTotal != null && offset >= reportedTotal) {
      break;
    }
    if (items.length < ORDERS_PAGE_LIMIT) {
      break;
    }
  }

  return yangoOrderMapToB2BRows(tokenConfig, client, uniqueById);
}

type B2BTokenClientPair = { tokenConfig: TokenConfig; client: YangoClient };
type YangoScope = { tokenLabel: string; clientId: string };

async function listB2BTokenClientPairs(
  scope?: YangoScope,
): Promise<{ pairs: B2BTokenClientPair[]; errors: string[] }> {
  const pairs: B2BTokenClientPair[] = [];
  const errors: string[] = [];
  const tokenConfigs = await getTokenConfigs();

  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
      if (scope && tokenConfig.label !== scope.tokenLabel) return;
      if (!tokenConfig.token) return;
      try {
        const authResponse = await fetchJson<YangoAuthListResponse>(
          `${YANGO_BASE_URL}/2.0/auth/list`,
          tokenConfig.token,
        );
        for (const client of authResponse.clients ?? []) {
          if (scope && client.client_id !== scope.clientId) continue;
          pairs.push({ tokenConfig, client });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (!message.includes("features_check_failed")) {
          errors.push(`${tokenConfig.label}: ${message}`);
        }
      }
    }),
  );

  return { pairs, errors };
}

/**
 * One list+report wave across all corp clients (offset per client from cursors).
 */
export async function fetchB2BOrdersListChunk(input: {
  since: string;
  till: string;
  cursors: B2BOrdersListCursors;
  listPageSize?: number;
  scope?: YangoScope;
}): Promise<{
  rows: B2BDashboardOrder[];
  nextCursors: B2BOrdersListCursors;
  anyClientMayHaveMore: boolean;
  errors: string[];
}> {
  const listPageSize = readPositiveIntEnv("YANGO_B2B_ORDERS_CHUNK_LIST_LIMIT", 80);
  const size = input.listPageSize ?? listPageSize;
  const { pairs, errors } = await listB2BTokenClientPairs(input.scope);
  const nextCursors: B2BOrdersListCursors = { ...input.cursors };
  let anyClientMayHaveMore = false;
  const rowLists = await Promise.all(
    pairs.map(async ({ tokenConfig, client }) => {
      const key = b2bOrdersCursorKey(tokenConfig.label, client.client_id);
      const offset = nextCursors[key] ?? 0;
      try {
        const response = await fetchOrdersListSinglePage(
          tokenConfig,
          client.client_id,
          input.since,
          input.till,
          offset,
          size,
        );
        const items = response.items ?? [];
        nextCursors[key] = offset + items.length;
        if (items.length >= size) {
          anyClientMayHaveMore = true;
        }
        const reportedTotal =
          typeof response.total_amount === "number" && response.total_amount > 0
            ? response.total_amount
            : null;
        if (reportedTotal != null && offset + items.length < reportedTotal) {
          anyClientMayHaveMore = true;
        }
        const map = new Map<string, YangoOrder>();
        for (const item of items) {
          map.set(item.id, item);
        }
        return await yangoOrderMapToB2BRows(tokenConfig, client, map);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${tokenConfig.label} / ${client.client_id}: ${message}`);
        nextCursors[key] = offset;
        return [] as B2BDashboardOrder[];
      }
    }),
  );

  const merged = new Map<string, B2BDashboardOrder>();
  for (const list of rowLists) {
    for (const row of list) {
      merged.set(b2bDashboardOrderKey(row), row);
    }
  }

  const rows = [...merged.values()].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );

  return { rows, nextCursors, anyClientMayHaveMore, errors };
}

/**
 * Pulls successive list chunks until `targetNewCount` new rows (not in excludeKeys) or sources exhaust.
 */
export async function pullB2BOrdersRows(input: {
  since: string;
  till: string;
  startCursors: B2BOrdersListCursors;
  targetNewCount: number;
  excludeKeys: Set<string>;
  excludeScheduling?: boolean;
  maxChunks?: number;
  scope?: YangoScope;
}): Promise<{
  newRows: B2BDashboardOrder[];
  nextCursors: B2BOrdersListCursors;
  hasMoreRemote: boolean;
  errors: string[];
}> {
  const maxChunks = Math.max(1, Math.min(input.maxChunks ?? 40, 80));
  const collected: B2BDashboardOrder[] = [];
  const seen = new Set<string>();
  let cursors = { ...input.startCursors };
  const aggErrors: string[] = [];
  let hasMoreRemote = false;

  outer: for (let i = 0; i < maxChunks && collected.length < input.targetNewCount; i += 1) {
    const chunk = await fetchB2BOrdersListChunk({
      since: input.since,
      till: input.till,
      cursors,
      scope: input.scope,
    });
    cursors = chunk.nextCursors;
    aggErrors.push(...chunk.errors);
    hasMoreRemote = chunk.anyClientMayHaveMore;

    for (const row of chunk.rows) {
      if (input.excludeScheduling && (row.statusRaw ?? "").toLowerCase().includes("scheduling")) {
        continue;
      }
      const key = b2bDashboardOrderKey(row);
      if (input.excludeKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      collected.push(row);
      if (collected.length >= input.targetNewCount) {
        break outer;
      }
    }

    if (!chunk.anyClientMayHaveMore) {
      hasMoreRemote = false;
      break outer;
    }
  }

  collected.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );

  return {
    newRows: collected.slice(0, input.targetNewCount),
    nextCursors: cursors,
    hasMoreRemote,
    errors: aggErrors,
  };
}

async function loadB2BPreOrdersDashboardData(range?: { since: string; till: string }) {
  const { since, till } = range ?? getDashboardDefaultRange();
  const rows: B2BDashboardOrder[] = [];
  const errors: string[] = [];
  const tokenConfigs = await getTokenConfigs();

  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
      if (!tokenConfig.token) {
        return;
      }

      try {
        const authResponse = await fetchJson<YangoAuthListResponse>(
          `${YANGO_BASE_URL}/2.0/auth/list`,
          tokenConfig.token,
        );

        const clients = authResponse.clients ?? [];
        const clientRows = await Promise.all(
          clients.map((client) =>
            getClientDashboardOrders(tokenConfig, client, since, till),
          ),
        );

        for (const rowsChunk of clientRows) {
          rows.push(...rowsChunk);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        if (!message.includes("features_check_failed")) {
          errors.push(`${tokenConfig.label}: ${message}`);
        }
      }
    }),
  );

  const uniqueRows = new Map<string, B2BDashboardOrder>();
  for (const row of rows) {
    uniqueRows.set(`${row.tokenLabel}:${row.orderId}`, row);
  }

  const resultRows = [...uniqueRows.values()].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );

  return { rows: resultRows, errors };
}

export async function getB2BPreOrdersDashboardData() {
  const now = Date.now();
  if (dashboardInMemoryCache && now - dashboardInMemoryCache.updatedAt < DASHBOARD_LOCAL_CACHE_TTL_MS) {
    return dashboardInMemoryCache.payload;
  }

  if (!dashboardInFlight) {
    dashboardInFlight = loadB2BPreOrdersDashboardData()
      .then((payload) => {
        dashboardInMemoryCache = {
          updatedAt: Date.now(),
          payload,
        };
        return payload;
      })
      .finally(() => {
        dashboardInFlight = null;
      });
  }

  return dashboardInFlight;
}

export async function getB2BPreOrdersDashboardDataForRange(input: {
  since: string;
  till: string;
}) {
  return loadB2BPreOrdersDashboardData({
    since: input.since,
    till: input.till,
  });
}

type B2BOrderDetailsInput = {
  tokenLabel: string;
  clientId: string;
  orderId: string;
};

export async function getB2BOrderDetails({
  tokenLabel,
  clientId,
  orderId,
}: B2BOrderDetailsInput): Promise<B2BOrderDetailsResponse> {
  const tokenConfig = (await getTokenConfigs()).find((item) => item.label === tokenLabel);

  if (!tokenConfig) {
    throw new Error(`Unknown token label: ${tokenLabel}`);
  }

  const [info, progress, report] = await Promise.all([
    fetchJsonNoCache<Record<string, unknown>>(
      `${YANGO_BASE_URL}/2.0/orders/info?order_id=${orderId}`,
      tokenConfig.token,
      clientId,
    ).catch(() => null),
    fetchJsonNoCache<Record<string, unknown>>(
      `${YANGO_BASE_URL}/2.0/orders/progress?order_id=${orderId}`,
      tokenConfig.token,
      clientId,
    ).catch(() => null),
    fetchJsonNoCache<YangoTaxiReportResponse>(
      `${YANGO_BASE_URL}/2.0/orders/taxi/report`,
      tokenConfig.token,
      clientId,
      {
        method: "POST",
        body: JSON.stringify({ ids: [orderId] }),
      },
    )
      .then((payload) => (payload.orders?.[0] as Record<string, unknown>) ?? null)
      .catch(() => null),
  ]);
  persistUserMapFromApiPayload({ tokenLabel, clientId }, info);
  persistUserMapFromApiPayload({ tokenLabel, clientId }, progress);
  persistUserMapFromApiPayload({ tokenLabel, clientId }, report);

  return {
    orderId,
    tokenLabel,
    clientId,
    fetchedAt: new Date().toISOString(),
    info,
    progress,
    report,
  };
}

async function resolveTokenConfig(tokenLabel: string) {
  const tokenConfig = (await getTokenConfigs()).find((item) => item.label === tokenLabel);
  if (!tokenConfig) {
    throw new Error(`Unknown token label: ${tokenLabel}`);
  }
  if (!tokenConfig.token) {
    throw new Error(`Token ${tokenLabel} is not configured.`);
  }
  return tokenConfig;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeRideLifecycleStatus(rawStatus: string): RequestRideLifecycleStatus {
  const status = rawStatus.toLowerCase();
  if (!status) return "unknown";
  if (status.includes("cancel")) return "cancelled";
  if (
    status.includes("complete") ||
    status.includes("finished") ||
    status.includes("transporting_finished")
  ) {
    return "completed";
  }
  if (status.includes("search")) return "searching";
  if (status.includes("transporting") || status.includes("in_progress")) return "in_progress";
  if (status.includes("arriv")) return "pickup";
  if (status.includes("performer") || status.includes("accepted") || status.includes("driving")) {
    return "driver_assigned";
  }
  return "unknown";
}

export function buildRequestRideBody(payload: RequestRidePayload): Record<string, unknown> {
  const sourceFullname = payload.sourceAddress.trim();
  const destinationFullname = payload.destinationAddress.trim();
  if (
    payload.sourceLat == null ||
    payload.sourceLon == null ||
    payload.destinationLat == null ||
    payload.destinationLon == null
  ) {
    throw new Error("source/destination geopoints are required to build ride request body.");
  }
  const resolvedUserId = payload.userId?.trim();
  if (!resolvedUserId) {
    throw new Error("Could not resolve user_id for the provided rider phone.");
  }
  // Yango API expects geopoint as [lon, lat].
  const sourceGeopoint: [number, number] = [payload.sourceLon, payload.sourceLat];
  const destinationGeopoint: [number, number] = [payload.destinationLon, payload.destinationLat];
  const waypointRoutePoints = (payload.waypoints ?? []).map((waypoint, index) => {
    const fullname = waypoint.address.trim();
    if (!fullname) {
      throw new Error(`Waypoint #${index + 1} address is required.`);
    }
    if (waypoint.lat == null || waypoint.lon == null) {
      throw new Error(`Waypoint #${index + 1} geopoint is required.`);
    }
    return {
      fullname,
      geopoint: [waypoint.lon, waypoint.lat] as [number, number],
    };
  });
  const body: Record<string, unknown> = {
    user_id: resolvedUserId,
    class: payload.rideClass.trim() || "comfortplus_b2b",
    source: { fullname: sourceFullname, geopoint: sourceGeopoint },
    destination: { fullname: destinationFullname, geopoint: destinationGeopoint },
    route: [
      { fullname: sourceFullname, geopoint: sourceGeopoint },
      ...waypointRoutePoints,
      { fullname: destinationFullname, geopoint: destinationGeopoint },
    ],
    phone: payload.phoneNumber.trim(),
    comment: payload.comment?.trim() || undefined,
  };
  const costCenterId = payload.costCenterId?.trim();
  if (costCenterId) {
    body.cost_center = costCenterId;
    body.cost_center_id = costCenterId;
    body.cost_centers_id = costCenterId;
    body.cost_centers_ids = [costCenterId];
    body.cost_centers = [costCenterId];
  }
  const scheduleAt = payload.scheduleAtIso?.trim();
  if (scheduleAt) {
    body.due_date = scheduleAt;
  }
  return body;
}

function phoneVariants(rawPhone: string): string[] {
  const raw = rawPhone.trim();
  const digits = raw.replace(/\D/g, "");
  const set = new Set<string>();
  if (raw) set.add(raw);
  if (digits) {
    set.add(digits);
    if (!digits.startsWith("+")) set.add(`+${digits}`);
    if (digits.startsWith("972")) set.add(`+${digits}`);
    if (digits.startsWith("0")) {
      const il = `972${digits.slice(1)}`;
      set.add(il);
      set.add(`+${il}`);
    }
  }
  return [...set];
}

function extractUserId(payload: Record<string, unknown>): string | null {
  const direct =
    asString(payload.user_id) ||
    asString(payload.userId) ||
    asString(payload.id);
  if (direct) return direct;
  const users = payload.users;
  if (Array.isArray(users)) {
    for (const item of users) {
      if (!item || typeof item !== "object") continue;
      const candidate = extractUserId(item as Record<string, unknown>);
      if (candidate) return candidate;
    }
  }
  return null;
}

function persistUserMapFromApiPayload(
  context: { tokenLabel: string; clientId: string },
  payload: unknown,
  fallbackPhone?: string,
) {
  if (!payload || typeof payload !== "object") return;
  const suggestions = extractUserSuggestionsFromPayload(payload);
  if (suggestions.length > 0) {
    for (const item of suggestions) {
      if (!item.phone || !item.userId) continue;
      upsertMappedUserId({
        tokenLabel: context.tokenLabel,
        clientId: context.clientId,
        phoneNumber: item.phone,
        userId: item.userId,
      });
    }
    return;
  }
  const userId = extractUserId(payload as Record<string, unknown>);
  if (!userId || !fallbackPhone) return;
  upsertMappedUserId({
    tokenLabel: context.tokenLabel,
    clientId: context.clientId,
    phoneNumber: fallbackPhone,
    userId,
  });
}

function isYangoUserListRowDeleted(record: Record<string, unknown>): boolean {
  return record.is_deleted === true;
}

function rowToSuggestion(record: Record<string, unknown>): RequestRideUserSuggestion | null {
  const userId =
    asString(record.user_id) || asString(record.userId) || asString(record.id);
  if (!userId) return null;
  const firstName = asString(record.first_name) || asString(record.firstName);
  const lastName = asString(record.last_name) || asString(record.lastName);
  const splitName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fullName =
    splitName ||
    asString(record.fullname) ||
    asString(record.full_name) ||
    asString(record.user_name) ||
    asString(record.username) ||
    asString(record.name) ||
    asString(record.nickname) ||
    null;
  const phone =
    asString(record.phone) || asString(record.phone_number) || asString(record.msisdn) || null;
  return {
    userId,
    phone,
    fullName,
    source: "api",
  };
}

type YangoUserListResponse = {
  items?: Array<Record<string, unknown>>;
  next_cursor?: string;
  cursor?: string;
  limit?: number;
  total_amount?: number;
};

export type YangoClientUserDirectoryEntry = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  department: string | null;
  costCenterId: string | null;
};

export type YangoCostCenter = {
  id: string;
  name: string;
};

/** Official employee list: GET /2.0/users (see Yandex B2B «Список сотрудников клиента»). */
async function fetchYangoUserListPage(
  token: string,
  clientId: string,
  options: { limit: number; cursor?: string },
): Promise<YangoUserListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  return fetchJsonNoCache<YangoUserListResponse>(
    `${YANGO_BASE_URL}/2.0/users?${params.toString()}`,
    token,
    clientId,
  );
}

function phoneKeysMatchYango(a: string | null | undefined, b: string): boolean {
  const ka = a ? normalizePhoneKey(a) : "";
  const kb = normalizePhoneKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

type YangoUserListPageHandler = (page: YangoUserListResponse, pageIndex: number) => boolean | Promise<boolean>;

/**
 * Walks paginated /2.0/users until a page fails, max pages reached, or callback returns false.
 */
async function forEachYangoUserListPage(
  token: string,
  clientId: string,
  maxPages: number,
  pageSize: number,
  onPage: YangoUserListPageHandler,
): Promise<void> {
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i += 1) {
    let page: YangoUserListResponse;
    try {
      page = await fetchYangoUserListPage(token, clientId, { limit: pageSize, cursor });
    } catch {
      return;
    }
    const goOn = await onPage(page, i);
    if (!goOn) return;
    const next = asString(page.next_cursor);
    if (!next) return;
    cursor = next;
  }
}

async function findUserIdViaYangoUserList(params: {
  token: string;
  clientId: string;
  phoneNumber: string;
}): Promise<string | null> {
  const maxPages = readPositiveIntEnv("YANGO_USER_LIST_MAX_PAGES_RESOLVE", 50);
  const pageSize = readPositiveIntEnv("YANGO_USER_LIST_PAGE_SIZE", 100);
  const variants = phoneVariants(params.phoneNumber);
  let found: string | null = null;

  await forEachYangoUserListPage(
    params.token,
    params.clientId,
    maxPages,
    pageSize,
    (page) => {
      for (const raw of page.items ?? []) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        if (isYangoUserListRowDeleted(row)) continue;
        const phone = asString(row.phone) || asString(row.phone_number) || asString(row.msisdn);
        if (!phone) continue;
        const match = variants.some((v) => phoneKeysMatchYango(phone, v));
        if (match) {
          const id =
            asString(row.user_id) || asString(row.userId) || asString(row.id) || null;
          if (id) {
            found = id;
            return false;
          }
        }
      }
      return true;
    },
  );

  return found;
}

/**
 * Only reads explicit user rows from list/info shapes — avoids deep-walking unrelated nested ids.
 */
function extractUserSuggestionsFromPayload(payload: unknown): RequestRideUserSuggestion[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const seen = new Set<string>();
  const out: RequestRideUserSuggestion[] = [];

  const push = (row: Record<string, unknown>) => {
    const suggestion = rowToSuggestion(row);
    if (!suggestion) return;
    const key = `${suggestion.userId}:${suggestion.phone ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(suggestion);
  };

  const listKeys = ["users", "items", "employees", "passengers"];
  for (const key of listKeys) {
    const value = root[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === "object") push(item as Record<string, unknown>);
    }
    if (out.length > 0) return out;
  }

  if (asString(root.user_id) || asString(root.userId) || asString(root.id)) {
    push(root);
  }

  return out;
}

function suggestionMatchesQuery(suggestion: RequestRideUserSuggestion, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;
  const digitsQ = q.replace(/\D/g, "");
  const phoneDigits = (suggestion.phone ?? "").replace(/\D/g, "");
  const name = (suggestion.fullName ?? "").toLowerCase();
  if (digitsQ && phoneDigits.includes(digitsQ)) return true;
  if (q && name.includes(q)) return true;
  if (digitsQ && suggestion.userId.toLowerCase().includes(digitsQ)) return true;
  return false;
}

export async function resolveRequestRideUserByPhone(input: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
}): Promise<RequestRideUserSuggestion | null> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const variants = phoneVariants(input.phoneNumber);
  const mapped = resolveMappedUserId(input);

  let permissionDenied = false;
  for (const phone of variants) {
    const attempts = [
      `${YANGO_BASE_URL}/2.0/users/info?phone=${encodeURIComponent(phone)}`,
      `${YANGO_BASE_URL}/2.0/users/info?phone_number=${encodeURIComponent(phone)}`,
      `${YANGO_BASE_URL}/2.0/users/list?phone=${encodeURIComponent(phone)}`,
      `${YANGO_BASE_URL}/2.0/users/list?phone_number=${encodeURIComponent(phone)}`,
    ];
    for (const url of attempts) {
      try {
        const response = await fetchJsonNoCache<Record<string, unknown>>(
          url,
          tokenConfig.token,
          input.clientId,
        );
        persistUserMapFromApiPayload(
          { tokenLabel: input.tokenLabel, clientId: input.clientId },
          response,
          phone,
        );
        const suggestions = extractUserSuggestionsFromPayload(response);
        const exactPhone = suggestions.find((item) =>
          variants.some((variant) => phoneKeysMatchYango(item.phone, variant)),
        );
        if (exactPhone) return exactPhone;
        // Do not fallback by arbitrary user_id from payload: it may belong to another phone.
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("permission_check_failed")) {
          permissionDenied = true;
          continue;
        }
        // continue probing with other query shapes
      }
    }
  }

  const fromOfficialList = await findUserIdViaYangoUserList({
    token: tokenConfig.token,
    clientId: input.clientId,
    phoneNumber: input.phoneNumber,
  });
  if (fromOfficialList) {
    upsertMappedUserId({
      tokenLabel: input.tokenLabel,
      clientId: input.clientId,
      phoneNumber: input.phoneNumber,
      userId: fromOfficialList,
    });
    const directory = await listYangoClientUsers({
      tokenLabel: input.tokenLabel,
      clientId: input.clientId,
      limit: 1000,
    }).catch(() => []);
    const match =
      directory.find((item) => variants.some((variant) => phoneKeysMatchYango(item.phone, variant))) ??
      directory.find((item) => item.userId === fromOfficialList);
    if (match) {
      return {
        userId: match.userId,
        phone: match.phone,
        fullName: match.fullName,
        source: "api",
      };
    }
    return { userId: fromOfficialList, phone: null, fullName: null, source: "api" };
  }

  const mappedAfterProbe = resolveMappedUserId(input) ?? mapped;
  if (mappedAfterProbe) {
    const directory = await listYangoClientUsers({
      tokenLabel: input.tokenLabel,
      clientId: input.clientId,
      limit: 1200,
    }).catch(() => []);
    const match =
      directory.find((item) =>
        variants.some((variant) => phoneKeysMatchYango(item.phone, variant)),
      ) ?? directory.find((item) => item.userId === mappedAfterProbe);
    if (
      match &&
      variants.some((variant) => phoneKeysMatchYango(match.phone, variant))
    ) {
      if (match.userId !== mappedAfterProbe) {
        upsertMappedUserId({
          tokenLabel: input.tokenLabel,
          clientId: input.clientId,
          phoneNumber: input.phoneNumber,
          userId: match.userId,
        });
      }
      return {
        userId: match.userId,
        phone: match.phone,
        fullName: match.fullName,
        source: "api",
      };
    }
  }
  if (permissionDenied) {
    throw new Error(
      "Selected API token has no permission to query users and no local phone->user_id mapping matched.",
    );
  }
  return null;
}

export async function ensureRequestRideUserByPhone(input: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
  fullName?: string | null;
  costCenterId?: string | null;
}) {
  const existing = await resolveRequestRideUserByPhone(input);
  if (existing?.userId) {
    return { ok: true as const, created: false as const, user: existing };
  }

  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const trimmedName = input.fullName?.trim() || "";
  const costCenterId = input.costCenterId?.trim() || "";
  const [firstName, ...rest] = trimmedName.split(/\s+/).filter(Boolean);
  const lastName = rest.join(" ").trim();
  const bodyCandidates: Array<Record<string, unknown>> = [
    {
      phone: input.phoneNumber,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_center_id: costCenterId || undefined,
      cost_center: costCenterId || undefined,
      cost_centers_id: costCenterId || undefined,
    },
    {
      phone: input.phoneNumber,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_center_id: costCenterId || undefined,
      cost_center: costCenterId || undefined,
      cost_centers_id: costCenterId ? [costCenterId] : undefined,
    },
    {
      phone_number: input.phoneNumber,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_center_id: costCenterId || undefined,
      cost_center: costCenterId || undefined,
      cost_centers_id: costCenterId || undefined,
    },
    {
      phone_number: input.phoneNumber,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_center_id: costCenterId || undefined,
      cost_center: costCenterId || undefined,
      cost_centers_id: costCenterId ? [costCenterId] : undefined,
    },
    {
      phone: input.phoneNumber,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_centers: costCenterId ? [costCenterId] : undefined,
    },
    {
      phone_number: input.phoneNumber,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_centers: costCenterId ? [costCenterId] : undefined,
    },
    { phone: input.phoneNumber, full_name: trimmedName || undefined },
    { phone_number: input.phoneNumber, full_name: trimmedName || undefined },
    {
      phone: input.phoneNumber,
      name: trimmedName || undefined,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_center_id: costCenterId || undefined,
      cost_center: costCenterId || undefined,
      cost_centers_id: costCenterId || undefined,
    },
    {
      phone: input.phoneNumber,
      name: trimmedName || undefined,
      fullname: trimmedName || undefined,
      is_active: true,
      cost_center_id: costCenterId || undefined,
      cost_center: costCenterId || undefined,
      cost_centers_id: costCenterId ? [costCenterId] : undefined,
    },
    {
      phone: input.phoneNumber,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
    },
  ];
  const requestCandidates: Array<{ endpoint: string; method: "POST" | "PUT" }> = [
    { endpoint: "/2.0/users/create", method: "POST" },
    { endpoint: "/2.0/users", method: "POST" },
    { endpoint: "/2.0/users", method: "PUT" },
    { endpoint: "/2.0/users/add", method: "POST" },
    { endpoint: "/2.0/users/register", method: "POST" },
  ];
  const errors: string[] = [];

  for (const candidate of requestCandidates) {
    for (const body of bodyCandidates) {
      try {
        await fetchJsonNoCache<Record<string, unknown>>(
          `${YANGO_BASE_URL}${candidate.endpoint}`,
          tokenConfig.token,
          input.clientId,
          { method: candidate.method, body: JSON.stringify(body) },
          { allowEmptyBody: true },
        );
        const resolved = await resolveRequestRideUserByPhone(input);
        if (resolved?.userId) {
          return { ok: true as const, created: true as const, user: resolved };
        }
      } catch (error) {
        errors.push(
          `${candidate.method} ${candidate.endpoint}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return {
    ok: false as const,
    created: false as const,
    error: errors[0] ??
      "Yango did not return a supported endpoint for employee creation; create employee in Yango corporate cabinet first.",
    attempts: errors,
  };
}

export async function resolveRequestRideUserIdByPhone(input: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
}): Promise<string | null> {
  const match = await resolveRequestRideUserByPhone(input);
  return match?.userId ?? null;
}

export async function searchRequestRideUsers(input: {
  tokenLabel: string;
  clientId: string;
  query: string;
  limit?: number;
}): Promise<RequestRideUserSuggestion[]> {
  const query = input.query.trim();
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  if (!query) return [];
  const byId = new Map<string, RequestRideUserSuggestion>();

  const push = (item: RequestRideUserSuggestion) => {
    if (!item.userId || byId.has(item.userId)) return;
    byId.set(item.userId, item);
  };

  const mapped = searchMappedUsers({
    tokenLabel: input.tokenLabel,
    clientId: input.clientId,
    query,
    limit,
    strictClientScope: true,
  });
  const mappedPhoneKeys = new Set(mapped.map((item) => normalizePhoneKey(item.phone)));
  const directoryByPhoneKey = new Map<string, YangoClientUserDirectoryEntry>();
  const directoryByUserId = new Map<string, YangoClientUserDirectoryEntry>();
  if (mapped.length > 0) {
    const directory = await listYangoClientUsers({
      tokenLabel: input.tokenLabel,
      clientId: input.clientId,
      limit: 1200,
    }).catch(() => []);
    for (const entry of directory) {
      directoryByUserId.set(entry.userId, entry);
      const key = normalizePhoneKey(entry.phone ?? "");
      if (key) directoryByPhoneKey.set(key, entry);
    }
  }
  for (const item of mapped) {
    const phoneKey = normalizePhoneKey(item.phone);
    const directoryHit =
      directoryByPhoneKey.get(phoneKey) || directoryByUserId.get(item.userId) || null;
    push({
      userId: item.userId,
      phone: item.phone,
      fullName: directoryHit?.fullName ?? null,
      source: "map",
    });
  }

  let tokenConfig: { token: string } | null = null;
  try {
    tokenConfig = await resolveTokenConfig(input.tokenLabel);
  } catch {
    tokenConfig = null;
  }

  if (tokenConfig && byId.size < limit) {
    const maxPages = readPositiveIntEnv("YANGO_USER_LIST_MAX_PAGES_SEARCH", 25);
    const pageSize = readPositiveIntEnv("YANGO_USER_LIST_PAGE_SIZE", 100);
    await forEachYangoUserListPage(
      tokenConfig.token,
      input.clientId,
      maxPages,
      pageSize,
      (page) => {
        for (const raw of page.items ?? []) {
          if (byId.size >= limit) return false;
          if (!raw || typeof raw !== "object") continue;
          const row = raw as Record<string, unknown>;
          if (isYangoUserListRowDeleted(row)) continue;
          const suggestion = rowToSuggestion(row);
          if (!suggestion) continue;
          if (!suggestionMatchesQuery(suggestion, query)) continue;
          if (suggestion.phone) {
            upsertMappedUserId({
              tokenLabel: input.tokenLabel,
              clientId: input.clientId,
              phoneNumber: suggestion.phone,
              userId: suggestion.userId,
            });
          }
          push(suggestion);
        }
        return byId.size < limit;
      },
    );
  }

  const attempts = [
    `${YANGO_BASE_URL}/2.0/users/list?query=${encodeURIComponent(query)}`,
    `${YANGO_BASE_URL}/2.0/users/list?search=${encodeURIComponent(query)}`,
    `${YANGO_BASE_URL}/2.0/users/list?q=${encodeURIComponent(query)}`,
    `${YANGO_BASE_URL}/2.0/users/list?phone=${encodeURIComponent(query)}`,
    `${YANGO_BASE_URL}/2.0/users/list?phone_number=${encodeURIComponent(query)}`,
    `${YANGO_BASE_URL}/2.0/users/info?phone=${encodeURIComponent(query)}`,
    `${YANGO_BASE_URL}/2.0/users/info?phone_number=${encodeURIComponent(query)}`,
  ];

  for (const url of attempts) {
    if (!tokenConfig) break;
    if (byId.size >= limit) break;
    try {
      const response = await fetchJsonNoCache<Record<string, unknown>>(
        url,
        tokenConfig.token,
        input.clientId,
      );
      const suggestions = extractUserSuggestionsFromPayload(response).filter((s) =>
        suggestionMatchesQuery(s, query),
      );
      for (const suggestion of suggestions) {
        if (suggestion.phone) {
          upsertMappedUserId({
            tokenLabel: input.tokenLabel,
            clientId: input.clientId,
            phoneNumber: suggestion.phone,
            userId: suggestion.userId,
          });
        }
        push(suggestion);
        if (byId.size >= limit) break;
      }
    } catch {
      // Ignore unsupported query shapes and continue.
    }
  }

  return [...byId.values()].slice(0, limit);
}

export async function listYangoClientUsers(input: {
  tokenLabel: string;
  clientId: string;
  limit?: number;
}): Promise<YangoClientUserDirectoryEntry[]> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const limit = Math.max(1, Math.min(input.limit ?? 500, 2000));
  const pageSize = Math.min(100, Math.max(20, readPositiveIntEnv("YANGO_USER_LIST_PAGE_SIZE", 100)));
  const maxPages = Math.max(1, Math.ceil(limit / pageSize) + 2);
  const out = new Map<string, YangoClientUserDirectoryEntry>();

  await forEachYangoUserListPage(
    tokenConfig.token,
    input.clientId,
    maxPages,
    pageSize,
    (page) => {
      for (const raw of page.items ?? []) {
        if (out.size >= limit) return false;
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        if (isYangoUserListRowDeleted(row)) continue;
        const userId =
          asString(row.user_id) ||
          asString(row.userId) ||
          asString(row._id) ||
          asString(row.id);
        if (!userId || out.has(userId)) continue;
        const firstName = asString(row.first_name) || asString(row.firstName);
        const lastName = asString(row.last_name) || asString(row.lastName);
        const fullNameFromSplit = [firstName, lastName].filter(Boolean).join(" ").trim();
        const fullName =
          fullNameFromSplit ||
          asString(row.full_name) ||
          asString(row.fullName) ||
          asString(row.name) ||
          null;
        const department =
          asString(row.department) ||
          asString(row.department_name) ||
          asString(row.division) ||
          null;
        out.set(userId, {
          userId,
          fullName,
          phone: asString(row.phone) || asString(row.phone_number) || asString(row.msisdn) || null,
          department,
          costCenterId: extractCostCenterIdFromUserRow(row),
        });
      }
      return out.size < limit;
    },
  );

  return [...out.values()];
}

function extractCostCentersFromPayload(payload: unknown): YangoCostCenter[] {
  if (!payload || typeof payload !== "object") return [];
  const candidates: unknown[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) {
      candidates.push(...node);
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    for (const key of [
      "cost_centers",
      "costCenters",
      "items",
      "data",
      "result",
      "cost_center",
      "costCenter",
      "cost_centers_id",
      "cost_centers_ids",
    ]) {
      const value = row[key];
      if (Array.isArray(value)) {
        candidates.push(...value);
      } else if (value && typeof value === "object") {
        candidates.push(value);
      } else if (typeof value === "string" && value.trim()) {
        candidates.push({ id: value.trim(), name: value.trim() });
      }
    }
    for (const value of Object.values(row)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(payload);
  const out = new Map<string, YangoCostCenter>();
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id =
      asString(row.id) ||
      asString(row.cost_center_id) ||
      asString(row.costCenterId) ||
      asString(row.cost_centerid) ||
      asString(row.cost_center) ||
      asString(row.costCenter);
    if (!id) continue;
    const name =
      asString(row.name) ||
      asString(row.title) ||
      asString(row.full_name) ||
      asString(row.fullName) ||
      id;
    if (!out.has(id)) out.set(id, { id, name: name || id });
  }
  return [...out.values()];
}

export async function listYangoCostCenters(input: {
  tokenLabel: string;
  clientId: string;
}): Promise<YangoCostCenter[]> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const candidates = [
    `${YANGO_BASE_URL}/2.0/cost_centers`,
    `${YANGO_BASE_URL}/2.0/cost-centers`,
    `${YANGO_BASE_URL}/2.0/costcenters`,
    `${YANGO_BASE_URL}/2.0/users/cost_centers`,
  ];
  const out = new Map<string, YangoCostCenter>();
  for (const url of candidates) {
    try {
      const payload = await fetchJsonNoCache<Record<string, unknown>>(
        url,
        tokenConfig.token,
        input.clientId,
      );
      for (const item of extractCostCentersFromPayload(payload)) {
        out.set(item.id, item);
      }
      if (out.size > 0) break;
    } catch {
      // continue probing
    }
  }
  return [...out.values()];
}

/**
 * B2B GET /2.0/users items: `cost_centers_id` is the cost-center settings id (UUID); `cost_center` is the display name.
 * Do not prefer `cost_center` over id fields — otherwise CORP bodies get a label instead of an id.
 * @see https://taxi__business-api.docs-viewer.yandex.ru/en/concepts/api20/user-list
 */
function extractCostCenterIdFromUserRow(row: Record<string, unknown>): string | null {
  const singleId =
    asString(row.cost_centers_id).trim() ||
    asString(row.cost_centers_ids).trim() ||
    asString(row.cost_center_id).trim() ||
    asString(row.costCenterId).trim() ||
    asString(row.cost_centerid).trim() ||
    asString(row.costCentersId).trim();
  if (singleId) return singleId;

  const list =
    (Array.isArray(row.cost_centers_id) ? row.cost_centers_id : null) ||
    (Array.isArray(row.cost_centers_ids) ? row.cost_centers_ids : null) ||
    (Array.isArray(row.costCentersId) ? row.costCentersId : null) ||
    (Array.isArray(row.cost_centers) ? row.cost_centers : null) ||
    (Array.isArray(row.costCenters) ? row.costCenters : null);
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const id =
          asString((item as Record<string, unknown>).id) ||
          asString((item as Record<string, unknown>).cost_center_id);
        if (id) return id;
      }
    }
  }

  const legacyName =
    asString(row.cost_center).trim() || asString(row.costCenter).trim();
  if (legacyName) return legacyName;

  return null;
}

export async function detectYangoDefaultCostCenterId(input: {
  tokenLabel: string;
  clientId: string;
}): Promise<string | null> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const attempts = [
    `${YANGO_BASE_URL}/2.0/users?limit=50`,
    `${YANGO_BASE_URL}/2.0/users/list?limit=50`,
  ];
  for (const url of attempts) {
    try {
      const payload = await fetchJsonNoCache<Record<string, unknown>>(
        url,
        tokenConfig.token,
        input.clientId,
      );
      const rows = Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.users)
          ? payload.users
          : [];
      for (const raw of rows) {
        if (!raw || typeof raw !== "object") continue;
        const id = extractCostCenterIdFromUserRow(raw as Record<string, unknown>);
        if (id) return id;
      }
    } catch {
      // continue probing
    }
  }

  const knownPhones = listMappedPhonesForClient({
    tokenLabel: input.tokenLabel,
    clientId: input.clientId,
    limit: 20,
  });
  for (const phone of knownPhones) {
    const endpoints = [
      `${YANGO_BASE_URL}/2.0/users/info?phone=${encodeURIComponent(phone)}`,
      `${YANGO_BASE_URL}/2.0/users/info?phone_number=${encodeURIComponent(phone)}`,
      `${YANGO_BASE_URL}/2.0/users/list?phone=${encodeURIComponent(phone)}`,
      `${YANGO_BASE_URL}/2.0/users/list?phone_number=${encodeURIComponent(phone)}`,
    ];
    for (const url of endpoints) {
      try {
        const payload = await fetchJsonNoCache<Record<string, unknown>>(
          url,
          tokenConfig.token,
          input.clientId,
        );
        const direct = extractCostCenterIdFromUserRow(payload);
        if (direct) return direct;
        const rows = [
          ...(Array.isArray(payload.items) ? payload.items : []),
          ...(Array.isArray(payload.users) ? payload.users : []),
        ];
        for (const raw of rows) {
          if (!raw || typeof raw !== "object") continue;
          const id = extractCostCenterIdFromUserRow(raw as Record<string, unknown>);
          if (id) return id;
        }
      } catch {
        // continue probing
      }
    }
  }
  return null;
}

export async function resolveUserCostCenterIdByPhone(input: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
}): Promise<string | null> {
  const phone = input.phoneNumber.trim();
  if (!phone) return null;
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const endpoints = [
    `${YANGO_BASE_URL}/2.0/users/info?phone=${encodeURIComponent(phone)}`,
    `${YANGO_BASE_URL}/2.0/users/info?phone_number=${encodeURIComponent(phone)}`,
    `${YANGO_BASE_URL}/2.0/users/list?phone=${encodeURIComponent(phone)}`,
    `${YANGO_BASE_URL}/2.0/users/list?phone_number=${encodeURIComponent(phone)}`,
  ];
  for (const url of endpoints) {
    try {
      const payload = await fetchJsonNoCache<Record<string, unknown>>(
        url,
        tokenConfig.token,
        input.clientId,
      );
      const direct = extractCostCenterIdFromUserRow(payload);
      if (direct) return direct;
      const rows = [
        ...(Array.isArray(payload.items) ? payload.items : []),
        ...(Array.isArray(payload.users) ? payload.users : []),
      ];
      for (const raw of rows) {
        if (!raw || typeof raw !== "object") continue;
        const id = extractCostCenterIdFromUserRow(raw as Record<string, unknown>);
        if (id) return id;
      }
    } catch {
      // continue probing
    }
  }
  return null;
}

export async function getRequestRideApiClients(scope?: YangoScope): Promise<YangoApiClientRef[]> {
  const rows: YangoApiClientRef[] = [];
  const tokenConfigs = await getTokenConfigs();
  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
      if (scope && tokenConfig.label !== scope.tokenLabel) return;
      if (!tokenConfig.token) return;
      try {
        const authResponse = await fetchJsonNoCache<YangoAuthListResponse>(
          `${YANGO_BASE_URL}/2.0/auth/list`,
          tokenConfig.token,
        );
        for (const client of authResponse.clients ?? []) {
          if (scope && client.client_id !== scope.clientId) continue;
          rows.push({
            tokenLabel: tokenConfig.label,
            clientId: client.client_id,
            clientName: tokenConfig.crmClientName ?? client.name ?? client.client_id,
          });
        }
      } catch {
        // Skip broken token/client mappings for request form options.
      }
    }),
  );

  const unique = new Map<string, YangoApiClientRef>();
  for (const row of rows) {
    unique.set(`${row.tokenLabel}:${row.clientId}`, row);
  }
  return [...unique.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

type CreateRequestRideOptions = {
  endpointOverride?: string;
  idempotencyToken?: string;
  tokenOverride?: string;
  clientIdOverride?: string;
};

async function createRequestRideInternal(
  payload: RequestRidePayload,
  options?: CreateRequestRideOptions,
): Promise<RequestRideResult> {
  const tokenConfig = options?.tokenOverride
    ? { token: options.tokenOverride, label: payload.tokenLabel }
    : await resolveTokenConfig(payload.tokenLabel);
  const targetClientId = options?.clientIdOverride?.trim() || payload.clientId;
  if (payload.userId?.trim() && payload.phoneNumber.trim()) {
    upsertMappedUserId({
      tokenLabel: payload.tokenLabel,
      clientId: targetClientId,
      phoneNumber: payload.phoneNumber,
      userId: payload.userId,
    });
  }
  const endpoint =
    options?.endpointOverride?.trim() ||
    process.env.YANGO_CREATE_ORDER_ENDPOINT ||
    "/2.0/orders/create";
  const createResponse = await fetchJsonNoCache<Record<string, unknown>>(
    `${YANGO_BASE_URL}${endpoint}`,
    tokenConfig.token,
    targetClientId,
    {
      method: "POST",
      headers: {
        "X-Idempotency-Token": options?.idempotencyToken || globalThis.crypto.randomUUID(),
      },
      body: JSON.stringify(buildRequestRideBody(payload)),
    },
  );

  const orderId =
    asString(createResponse.order_id) ||
    asString(createResponse.id) ||
    asString(createResponse.orderId);
  if (!orderId) {
    throw new Error("Yango API did not return order id for created ride.");
  }
  const status =
    asString(createResponse.status) ||
    asString(createResponse.state) ||
    "created";

  return {
    orderId,
    status,
    etaMinutes:
      asNumberOrNull(createResponse.eta_minutes) ??
      asNumberOrNull(createResponse.estimated_waiting) ??
      null,
    warning:
      endpoint === "/2.0/orders/create"
        ? undefined
        : `Create endpoint overridden via YANGO_CREATE_ORDER_ENDPOINT=${endpoint}`,
  };
}

export async function createRequestRide(payload: RequestRidePayload): Promise<RequestRideResult> {
  return createRequestRideInternal(payload);
}

/**
 * Cancels a scheduled/active order in the selected corp client context.
 * Override path with YANGO_CANCEL_ORDER_ENDPOINT if your tenant uses a different route.
 */
export async function cancelYangoOrder(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
}): Promise<void> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const endpointCandidates = [
    process.env.YANGO_CANCEL_ORDER_ENDPOINT?.trim(),
    "/2.0/orders/cancel",
  ].filter((item): item is string => Boolean(item && item.length > 0));
  const uniqueEndpoints = [...new Set(endpointCandidates)];
  const bodyCandidates = [
    JSON.stringify({ state: "free" }),
    JSON.stringify({ state: "paid" }),
    JSON.stringify({ state: "minimal" }),
    JSON.stringify({ order_id: input.orderId }),
    JSON.stringify({ order_id: input.orderId, state: "free" }),
    JSON.stringify({ order_id: input.orderId, state: "paid" }),
    JSON.stringify({ order_id: input.orderId, state: "minimal" }),
    JSON.stringify({ orderId: input.orderId }),
    JSON.stringify({ id: input.orderId }),
    JSON.stringify({ order_id: input.orderId, reason: "client_request" }),
    JSON.stringify({ order_id: input.orderId, cancel_reason: "client_request" }),
  ];
  const uniqueBodies = [...new Set(bodyCandidates)];
  const attemptErrors: string[] = [];
  for (const endpoint of uniqueEndpoints) {
    const endpointWithQuery = `${endpoint}?order_id=${encodeURIComponent(input.orderId)}`;
    const queryAttempts: Array<{
      method: "POST";
      url: string;
      body?: string;
      headers?: HeadersInit;
    }> = [
      {
        method: "POST",
        url: endpointWithQuery,
        body: JSON.stringify({ order_id: input.orderId, state: "free" }),
        headers: { "Content-Type": "application/json" },
      },
      {
        method: "POST",
        url: endpointWithQuery,
        body: JSON.stringify({ order_id: input.orderId, state: "paid" }),
        headers: { "Content-Type": "application/json" },
      },
      {
        method: "POST",
        url: endpointWithQuery,
        body: JSON.stringify({ order_id: input.orderId, state: "minimal" }),
        headers: { "Content-Type": "application/json" },
      },
      {
        method: "POST",
        url: endpointWithQuery,
        body: `order_id=${encodeURIComponent(input.orderId)}&state=free`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      {
        method: "POST",
        url: endpointWithQuery,
        body: `order_id=${encodeURIComponent(input.orderId)}&state=paid`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      {
        method: "POST",
        url: endpoint,
        body: `order_id=${encodeURIComponent(input.orderId)}&state=free`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    ];
    for (const attempt of queryAttempts) {
      try {
        await fetchJsonNoCache<Record<string, unknown>>(
          `${YANGO_BASE_URL}${attempt.url}`,
          tokenConfig.token,
          input.clientId,
          {
            method: attempt.method,
            headers: {
              "X-Idempotency-Token": globalThis.crypto.randomUUID(),
              ...(attempt.headers ?? {}),
            },
            body: attempt.body,
          },
          { allowEmptyBody: true },
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attemptErrors.push(`${attempt.method} ${attempt.url}: ${message}`);
      }
    }

    for (const body of uniqueBodies) {
      try {
        await fetchJsonNoCache<Record<string, unknown>>(
          `${YANGO_BASE_URL}${endpoint}`,
          tokenConfig.token,
          input.clientId,
          {
            method: "POST",
            headers: {
              "X-Idempotency-Token": globalThis.crypto.randomUUID(),
            },
            body,
          },
          { allowEmptyBody: true },
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attemptErrors.push(`POST ${endpoint} ${body}: ${message}`);
      }
    }
  }
  throw new Error(
    attemptErrors.length > 0
      ? `Failed to cancel order after ${attemptErrors.length} attempts. ${attemptErrors[0]}`
      : "Failed to cancel order.",
  );
}

export async function getRequestRideStatus(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
}): Promise<RequestRideStatus> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);

  const [info, progress, report] = await Promise.all([
    fetchJsonNoCache<YangoOrderInfoResponse>(
      `${YANGO_BASE_URL}/2.0/orders/info?order_id=${input.orderId}`,
      tokenConfig.token,
      input.clientId,
    ).catch(() => null),
    fetchJsonNoCache<YangoOrderProgressResponse>(
      `${YANGO_BASE_URL}/2.0/orders/progress?order_id=${input.orderId}`,
      tokenConfig.token,
      input.clientId,
    ).catch(() => null),
    fetchJsonNoCache<YangoTaxiReportResponse>(
      `${YANGO_BASE_URL}/2.0/orders/taxi/report`,
      tokenConfig.token,
      input.clientId,
      {
        method: "POST",
        body: JSON.stringify({ ids: [input.orderId] }),
      },
    )
      .then((payload) => (payload.orders?.[0] as Record<string, unknown>) ?? null)
      .catch(() => null),
  ]);
  persistUserMapFromApiPayload({ tokenLabel: input.tokenLabel, clientId: input.clientId }, info);
  persistUserMapFromApiPayload(
    { tokenLabel: input.tokenLabel, clientId: input.clientId },
    progress,
  );
  persistUserMapFromApiPayload({ tokenLabel: input.tokenLabel, clientId: input.clientId }, report);

  const reportRideStatus = (report?.ride_status ?? null) as
    | { value?: string; text?: string }
    | null;
  const statusRaw =
    progress?.status ?? info?.status ?? reportRideStatus?.value ?? "unknown";
  const lifecycleStatus = normalizeRideLifecycleStatus(statusRaw);
  const performer = progress?.performer ?? info?.performer;
  const driverDetails = extractDriverDetails(performer, report);
  return {
    orderId: input.orderId,
    tokenLabel: input.tokenLabel,
    clientId: input.clientId,
    lifecycleStatus,
    statusRaw,
    statusText: progress?.status_text ?? reportRideStatus?.text ?? statusRaw,
    fetchedAt: new Date().toISOString(),
    driverName: performer?.fullname ?? driverDetails.driverName,
    driverPhone: performer?.phone ?? null,
    driverFirstName: driverDetails.driverFirstName,
    driverLastName: driverDetails.driverLastName,
    carModel: driverDetails.carModel,
    carPlate: driverDetails.carPlate,
    etaMinutes:
      progress?.eta_minutes ??
      progress?.expected_waiting_time ??
      info?.estimated_waiting ??
      info?.estimated_waiting_time ??
      info?.waiting_time ??
      null,
    info: (info as Record<string, unknown> | null) ?? null,
    progress: (progress as Record<string, unknown> | null) ?? null,
    report,
  };
}

function getStringField(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function splitFullName(fullname: string | null | undefined): {
  first: string | null;
  last: string | null;
} {
  if (!fullname || typeof fullname !== "string") return { first: null, last: null };
  const parts = fullname.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Extracts driver split-names + vehicle model/plate from various Yango payload
 * shapes. Tolerant: walks `performer.vehicle`, `performer.car`, and falls back
 * to top-level `report` keys when present.
 */
export function extractDriverDetailsFromYangoShapes(
  performer: Record<string, unknown> | null | undefined,
  report: Record<string, unknown> | null,
): {
  driverName: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  carModel: string | null;
  carPlate: string | null;
} {
  return extractDriverDetails((performer ?? undefined) as YangoPerformer | undefined, report);
}

function extractDriverDetails(
  performer: YangoPerformer | undefined,
  report: Record<string, unknown> | null,
): {
  driverName: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  carModel: string | null;
  carPlate: string | null;
} {
  const performerRecord = (performer ?? {}) as Record<string, unknown>;
  const vehicleRecord =
    ((performer?.vehicle ?? performer?.car) as Record<string, unknown> | undefined) ?? null;
  const reportRecord = report ?? {};

  let firstName =
    getStringField(performerRecord, "first_name", "firstname") ??
    getStringField(reportRecord, "driver_first_name", "performer_first_name");
  let lastName =
    getStringField(performerRecord, "last_name", "lastname") ??
    getStringField(reportRecord, "driver_last_name", "performer_last_name");

  const fullname =
    getStringField(performerRecord, "fullname", "full_name", "name") ??
    getStringField(reportRecord, "driver_name", "performer_name");

  if ((!firstName || !lastName) && fullname) {
    const split = splitFullName(fullname);
    if (!firstName) firstName = split.first;
    if (!lastName) lastName = split.last;
  }

  const carBrand =
    getStringField(vehicleRecord, "brand", "car_brand", "manufacturer") ??
    getStringField(reportRecord, "car_brand", "vehicle_brand");
  const carModelRaw =
    getStringField(vehicleRecord, "model", "car_model") ??
    getStringField(reportRecord, "car_model", "vehicle_model");
  const carModel =
    carBrand && carModelRaw ? `${carBrand} ${carModelRaw}` : (carModelRaw ?? carBrand ?? null);

  const carPlate =
    getStringField(
      vehicleRecord,
      "licence_plate",
      "license_plate",
      "plates",
      "number",
      "car_number",
    ) ??
    getStringField(
      reportRecord,
      "license_plate",
      "licence_plate",
      "car_number",
      "vehicle_plate",
    );

  return {
    driverName: fullname,
    driverFirstName: firstName,
    driverLastName: lastName,
    carModel,
    carPlate,
  };
}

export type PreOrderFallbackRunResult = {
  sourceOrderId: string;
  tokenLabel: string;
  clientId: string;
  status: "skipped" | "completed" | "failed";
  reason: string;
  fallbackOrderId?: string | null;
};

export type B2CFallbackAccountSettings = {
  token: string;
  clientId: string;
  rideClass: string;
  createEndpoint: string | null;
};

export function shouldRunPreOrderFallbackByTime(input: {
  scheduledAtIso: string | null | undefined;
  thresholdMinutes: number;
  nowTs?: number;
}): boolean {
  const scheduledTs = input.scheduledAtIso ? new Date(input.scheduledAtIso).getTime() : 0;
  if (!scheduledTs || !Number.isFinite(scheduledTs)) return false;
  const now = input.nowTs ?? Date.now();
  return now >= scheduledTs - Math.max(1, input.thresholdMinutes) * 60_000;
}

function getPreOrderScheduledTs(preOrder: PreOrder, details: B2BOrderDetailsResponse): number {
  const candidates = [
    preOrder.scheduledAt,
    asString(details.report?.local_due_datetime),
    asString(details.report?.due_datetime),
    asString(details.info?.due_date),
  ];
  for (const item of candidates) {
    if (!item) continue;
    const ts = new Date(item).getTime();
    if (Number.isFinite(ts) && ts > 0) return ts;
  }
  return 0;
}

function hasAssignedDriver(details: B2BOrderDetailsResponse, preOrder: PreOrder): boolean {
  const performerInfo =
    (details.info?.performer as Record<string, unknown> | undefined) ??
    (details.progress?.performer as Record<string, unknown> | undefined) ??
    null;
  const statusRaw = (
    asString(details.progress?.status) ||
    asString(details.info?.status) ||
    preOrder.orderStatus ||
    ""
  ).toLowerCase();
  const lifecycle = normalizeRideLifecycleStatus(statusRaw);
  if (lifecycle === "driver_assigned" || lifecycle === "pickup" || lifecycle === "in_progress") {
    return true;
  }
  return Boolean(
    preOrder.driverAssigned ||
      preOrder.driverId ||
      preOrder.driverPhone ||
      asString(performerInfo?.id) ||
      asString(performerInfo?.phone) ||
      asString(performerInfo?.fullname),
  );
}

function readGeopoint(value: unknown): { lat: number; lon: number } | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lon = asNumberOrNull(value[0]);
    const lat = asNumberOrNull(value[1]);
    if (lat != null && lon != null) return { lat, lon };
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const lon = asNumberOrNull(row.lon ?? row.longitude ?? row.lng);
    const lat = asNumberOrNull(row.lat ?? row.latitude);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
}

function extractOrderRouteSeed(preOrder: PreOrder, details: B2BOrderDetailsResponse): {
  sourceAddress: string;
  destinationAddress: string;
  sourceLat: number | null;
  sourceLon: number | null;
  destinationLat: number | null;
  destinationLon: number | null;
  comment: string | null;
  userId: string | null;
  phoneNumber: string | null;
} {
  const info = (details.info ?? {}) as Record<string, unknown>;
  const report = (details.report ?? {}) as Record<string, unknown>;
  const sourceObj =
    (info.source as Record<string, unknown> | undefined) ??
    (report.source as Record<string, unknown> | undefined) ??
    null;
  const destinationObj =
    (info.destination as Record<string, unknown> | undefined) ??
    (report.destination as Record<string, unknown> | undefined) ??
    null;
  const sourcePoint = readGeopoint(sourceObj?.geopoint ?? sourceObj?.point ?? null);
  const destinationPoint = readGeopoint(destinationObj?.geopoint ?? destinationObj?.point ?? null);
  const sourceAddress =
    asString(sourceObj?.fullname) || asString(report.source_fullname) || preOrder.pointA;
  const destinationAddress =
    asString(destinationObj?.fullname) || asString(report.destination_fullname) || preOrder.pointB;
  const comment =
    asString(info.comment) || asString(info.notes) || asString((info.route_info as Record<string, unknown>)?.comment);
  const phone =
    asString(info.phone) ||
    asString((info.user as Record<string, unknown> | undefined)?.phone) ||
    asString((info.passenger as Record<string, unknown> | undefined)?.phone) ||
    asString((report.user as Record<string, unknown> | undefined)?.phone) ||
    null;
  const userId =
    asString(info.user_id) ||
    asString((info.user as Record<string, unknown> | undefined)?.id) ||
    asString((info.passenger as Record<string, unknown> | undefined)?.id) ||
    null;
  return {
    sourceAddress: sourceAddress || preOrder.pointA,
    destinationAddress: destinationAddress || preOrder.pointB,
    sourceLat: sourcePoint?.lat ?? null,
    sourceLon: sourcePoint?.lon ?? null,
    destinationLat: destinationPoint?.lat ?? null,
    destinationLon: destinationPoint?.lon ?? null,
    comment: comment || null,
    userId: userId || null,
    phoneNumber: phone || null,
  };
}

async function findTenantB2CSettingsByScope(input: {
  tokenLabel: string;
  clientId: string;
}): Promise<B2CFallbackAccountSettings | null> {
  const store = await loadAuthStore();
  const tenant = (store.tenantAccounts ?? []).find(
    (item) => item.tokenLabel === input.tokenLabel && item.apiClientId === input.clientId,
  );
  if (!tenant || !tenant.b2cEnabled) return null;
  const token = tenant.b2cToken?.trim() || "";
  if (!token) return null;
  return {
    token,
    clientId: tenant.b2cClientId?.trim() || input.clientId,
    rideClass: tenant.b2cRideClass?.trim() || "comfortplus",
    createEndpoint: tenant.b2cCreateEndpoint?.trim() || null,
  };
}

async function resolveUserPhoneByUserId(input: {
  tokenLabel: string;
  clientId: string;
  userId: string;
}): Promise<string | null> {
  const tokenConfig = await resolveTokenConfig(input.tokenLabel);
  const endpoints = [
    `${YANGO_BASE_URL}/2.0/users/info?user_id=${encodeURIComponent(input.userId)}`,
    `${YANGO_BASE_URL}/2.0/users/list?user_id=${encodeURIComponent(input.userId)}`,
    `${YANGO_BASE_URL}/2.0/users?user_id=${encodeURIComponent(input.userId)}`,
  ];
  for (const url of endpoints) {
    try {
      const payload = await fetchJsonNoCache<Record<string, unknown>>(
        url,
        tokenConfig.token,
        input.clientId,
      );
      const suggestions = extractUserSuggestionsFromPayload(payload);
      const match = suggestions.find((item) => item.userId === input.userId && item.phone?.trim());
      if (match?.phone?.trim()) return match.phone.trim();
      const direct =
        asString(payload.phone) ||
        asString(payload.phone_number) ||
        asString((payload.user as Record<string, unknown> | undefined)?.phone);
      if (direct.trim()) return direct.trim();
    } catch {
      // continue probing
    }
  }
  return null;
}

export async function fallbackPreOrderToB2C(input: {
  preOrder: PreOrder;
  thresholdMinutes?: number;
  force?: boolean;
  b2cSettingsOverride?: B2CFallbackAccountSettings | null;
}): Promise<PreOrderFallbackRunResult> {
  const thresholdMinutes = Math.max(1, input.thresholdMinutes ?? 5);
  const lockOwner = `run-${globalThis.crypto.randomUUID()}`;
  const lock = tryStartPreOrderFallbackAttempt({
    tokenLabel: input.preOrder.tokenLabel,
    clientId: input.preOrder.clientId,
    orderId: input.preOrder.orderId,
    thresholdMinutes,
    lockOwner,
  });
  if (!lock.ok) {
    return {
      sourceOrderId: input.preOrder.orderId,
      tokenLabel: input.preOrder.tokenLabel,
      clientId: input.preOrder.clientId,
      status: "skipped",
      reason: lock.reason,
      fallbackOrderId: lock.snapshot?.fallbackOrderId ?? null,
    };
  }

  const finish = (
    outcome: "skipped" | "failed" | "completed",
    reason: string,
    fallbackOrderId?: string | null,
  ): PreOrderFallbackRunResult => {
    finishPreOrderFallbackAttempt({
      tokenLabel: input.preOrder.tokenLabel,
      clientId: input.preOrder.clientId,
      orderId: input.preOrder.orderId,
      lockOwner,
      outcome,
      reason,
      fallbackOrderId: fallbackOrderId ?? null,
    });
    return {
      sourceOrderId: input.preOrder.orderId,
      tokenLabel: input.preOrder.tokenLabel,
      clientId: input.preOrder.clientId,
      status: outcome,
      reason,
      fallbackOrderId: fallbackOrderId ?? null,
    };
  };

  try {
    const details = await getB2BOrderDetails({
      tokenLabel: input.preOrder.tokenLabel,
      clientId: input.preOrder.clientId,
      orderId: input.preOrder.orderId,
    });
    const statusRaw = (
      asString(details.progress?.status) ||
      asString(details.info?.status) ||
      input.preOrder.orderStatus ||
      ""
    ).toLowerCase();
    if (isCancelledStatus(statusRaw) || isCompletedStatus(statusRaw)) {
      return finish("skipped", "already_terminal");
    }
    const scheduledTs = getPreOrderScheduledTs(input.preOrder, details);
    if (!scheduledTs) {
      return finish("failed", "scheduled_time_missing");
    }
    if (
      !input.force &&
      !shouldRunPreOrderFallbackByTime({
        scheduledAtIso: new Date(scheduledTs).toISOString(),
        thresholdMinutes,
      })
    ) {
      return finish("skipped", "before_threshold");
    }
    if (!input.force && hasAssignedDriver(details, input.preOrder)) {
      return finish("skipped", "driver_assigned");
    }

    const routeSeed = extractOrderRouteSeed(input.preOrder, details);
    if (
      !routeSeed.sourceAddress ||
      !routeSeed.destinationAddress ||
      routeSeed.sourceLat == null ||
      routeSeed.sourceLon == null ||
      routeSeed.destinationLat == null ||
      routeSeed.destinationLon == null
    ) {
      return finish("failed", "route_seed_incomplete");
    }
    let userId = routeSeed.userId?.trim() || "";
    if (!userId && routeSeed.phoneNumber?.trim()) {
      const resolved = await resolveRequestRideUserByPhone({
        tokenLabel: input.preOrder.tokenLabel,
        clientId: input.preOrder.clientId,
        phoneNumber: routeSeed.phoneNumber.trim(),
      }).catch(() => null);
      userId = resolved?.userId ?? "";
    }
    if (!userId) {
      return finish("failed", "user_id_missing_for_phone");
    }
    let phoneNumber = routeSeed.phoneNumber?.trim() || "";
    if (!phoneNumber) {
      const resolvedPhone = await resolveUserPhoneByUserId({
        tokenLabel: input.preOrder.tokenLabel,
        clientId: input.preOrder.clientId,
        userId,
      }).catch(() => null);
      phoneNumber = resolvedPhone?.trim() || "";
    }
    if (!phoneNumber) {
      return finish("failed", "rider_phone_missing");
    }

    await cancelYangoOrder({
      tokenLabel: input.preOrder.tokenLabel,
      clientId: input.preOrder.clientId,
      orderId: input.preOrder.orderId,
    });

    const b2cSettings =
      input.b2cSettingsOverride ??
      (await findTenantB2CSettingsByScope({
        tokenLabel: input.preOrder.tokenLabel,
        clientId: input.preOrder.clientId,
      }));
    if (!b2cSettings) {
      return finish("failed", "b2c_account_not_configured");
    }
    const fallbackResult = await createRequestRideInternal(
      {
        tokenLabel: input.preOrder.tokenLabel,
        clientId: b2cSettings.clientId,
        rideClass: b2cSettings.rideClass,
        userId,
        sourceAddress: routeSeed.sourceAddress,
        destinationAddress: routeSeed.destinationAddress,
        sourceLat: routeSeed.sourceLat,
        sourceLon: routeSeed.sourceLon,
        destinationLat: routeSeed.destinationLat,
        destinationLon: routeSeed.destinationLon,
        phoneNumber,
        comment: routeSeed.comment,
        scheduleAtIso: null,
      },
      {
        endpointOverride: b2cSettings.createEndpoint ?? undefined,
        tokenOverride: b2cSettings.token,
        clientIdOverride: b2cSettings.clientId,
        idempotencyToken: `fallback-${input.preOrder.orderId}`,
      },
    );
    return finish("completed", "fallback_created", fallbackResult.orderId);
  } catch (error) {
    return finish("failed", error instanceof Error ? error.message : String(error));
  }
}

export async function runPreOrderFallbackSweep(input?: {
  preOrders?: PreOrder[];
  scope?: { tokenLabel: string; clientId: string };
  thresholdMinutes?: number;
  force?: boolean;
  b2cSettingsOverride?: B2CFallbackAccountSettings | null;
}) {
  const thresholdMinutes = Math.max(1, input?.thresholdMinutes ?? 5);
  const sourcePreOrders =
    input?.preOrders ??
    (input?.scope
      ? (await getScopedYangoPreOrders(input.scope)).preOrders
      : (await loadAllYangoPreOrders()).preOrders);
  const now = Date.now();
  const candidates = sourcePreOrders.filter((preOrder) => {
    if (input?.scope) {
      if (
        preOrder.tokenLabel !== input.scope.tokenLabel ||
        preOrder.clientId !== input.scope.clientId
      ) {
        return false;
      }
    }
    const scheduledTs = preOrder.scheduledAt ? new Date(preOrder.scheduledAt).getTime() : 0;
    if (!scheduledTs || !Number.isFinite(scheduledTs)) return false;
    if (
      !input?.force &&
      !shouldRunPreOrderFallbackByTime({
        scheduledAtIso: preOrder.scheduledAt,
        thresholdMinutes,
        nowTs: now,
      })
    ) {
      return false;
    }
    return true;
  });

  const results: PreOrderFallbackRunResult[] = [];
  for (const preOrder of candidates) {
    const result = await fallbackPreOrderToB2C({
      preOrder,
      thresholdMinutes,
      force: input?.force,
      b2cSettingsOverride: input?.b2cSettingsOverride ?? null,
    });
    results.push(result);
  }
  const changed = results.some((item) => item.status === "completed");
  return { changed, checked: candidates.length, results };
}
