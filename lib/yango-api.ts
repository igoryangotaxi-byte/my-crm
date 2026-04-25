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
  normalizePhoneKey,
  resolveMappedUserId,
  searchMappedUsers,
  upsertMappedUserId,
} from "@/lib/request-rides-user-map";
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

type YangoPerformer = {
  id?: string;
  fullname?: string;
  phone?: string;
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

const tokenConfigs: TokenConfig[] = [
  {
    label: "COFIX",
    token: process.env.YANGO_TOKEN_COFIX ?? process.env.YANGO_TOKEN_SAMELET ?? "",
  },
  {
    label: "SHUFERSAL",
    token: process.env.YANGO_TOKEN_SHUFERSAL ?? "",
  },
  {
    label: "TEST CABINET",
    crmClientName: "TEST CABINET",
    token:
      process.env.YANGO_TOKEN_TEST_CABINET?.trim() ||
      process.env.YANGO_TOKEN_APLI_TAXI_OZ ||
      "",
  },
  {
    label: "SHANA10",
    crmClientName: "SHANA10",
    token: process.env.YANGO_TOKEN_SHANA10 ?? process.env.YANGO_TOKEN_RYDEMOBILITY ?? "",
  },
  {
    label: "TELAVIVMUNICIPALITY",
    crmClientName: "TelAvivMunicipality",
    token: process.env.YANGO_TOKEN_TEL_AVIV_MUNICIPALITY ?? "",
  },
  {
    label: "YANGODELI",
    crmClientName: "YangoDeli",
    token: process.env.YANGO_TOKEN_YANGO_DELI ?? "",
  },
  {
    label: "SHLAV",
    crmClientName: "SHLAV",
    token: process.env.YANGO_TOKEN_SHLAV ?? "",
  },
  {
    label: "SAMLET_MOTORS",
    crmClientName: "סמלת מוטורס",
    token: process.env.YANGO_TOKEN_SAMLET_MOTORS ?? "",
  },
  {
    label: "HAMOSHAVA_20",
    crmClientName: "המושבה 20 בע\"מ",
    token: process.env.YANGO_TOKEN_HAMOSHAVA_20 ?? "",
  },
  {
    label: "Star Taxi Point",
    crmClientName: "Star Taxi Point",
    token: process.env.YANGO_TOKEN_STAR_TAXI_POINT ?? "",
  },
];

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

async function loadAllYangoPreOrders() {
  const preOrders: PreOrder[] = [];
  const errors: string[] = [];
  const diagnostics: TokenDiagnostics[] = [];

  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
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

  return { preOrders, errors, diagnostics };
}

export const getAllYangoPreOrders = unstable_cache(
  loadAllYangoPreOrders,
  ["yango-preorders-v3"],
  { revalidate: PREORDERS_CACHE_REVALIDATE_SECONDS, tags: ["yango-preorders"] },
);

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

/** Same calendar window as Orders UI (Orders page + panel defaults). */
export function getB2BOrdersViewDefaultRange(): {
  since: string;
  till: string;
  fromDateStr: string;
  toDateStr: string;
} {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 90);
  const fromDateStr = toDateInputValueUtc(from);
  const toDateStr = toDateInputValueUtc(to);
  return {
    fromDateStr,
    toDateStr,
    since: new Date(`${fromDateStr}T00:00:00`).toISOString(),
    till: new Date(`${toDateStr}T23:59:59`).toISOString(),
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
    sorting_direction: "1",
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

async function listB2BTokenClientPairs(): Promise<{ pairs: B2BTokenClientPair[]; errors: string[] }> {
  const pairs: B2BTokenClientPair[] = [];
  const errors: string[] = [];

  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
      if (!tokenConfig.token) return;
      try {
        const authResponse = await fetchJson<YangoAuthListResponse>(
          `${YANGO_BASE_URL}/2.0/auth/list`,
          tokenConfig.token,
        );
        for (const client of authResponse.clients ?? []) {
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
}): Promise<{
  rows: B2BDashboardOrder[];
  nextCursors: B2BOrdersListCursors;
  anyClientMayHaveMore: boolean;
  errors: string[];
}> {
  const listPageSize = readPositiveIntEnv("YANGO_B2B_ORDERS_CHUNK_LIST_LIMIT", 80);
  const size = input.listPageSize ?? listPageSize;
  const { pairs, errors } = await listB2BTokenClientPairs();
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
  maxChunks?: number;
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
    });
    cursors = chunk.nextCursors;
    aggErrors.push(...chunk.errors);
    hasMoreRemote = chunk.anyClientMayHaveMore;

    for (const row of chunk.rows) {
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
  const tokenConfig = tokenConfigs.find((item) => item.label === tokenLabel);

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

function resolveTokenConfig(tokenLabel: string) {
  const tokenConfig = tokenConfigs.find((item) => item.label === tokenLabel);
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

function collectPhones(payload: unknown, set: Set<string>) {
  if (!payload || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    for (const item of payload) collectPhones(item, set);
    return;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && key.toLowerCase().includes("phone")) {
      set.add(value);
    } else if (value && typeof value === "object") {
      collectPhones(value, set);
    }
  }
}

function persistUserMapFromApiPayload(
  context: { tokenLabel: string; clientId: string },
  payload: unknown,
  fallbackPhone?: string,
) {
  if (!payload || typeof payload !== "object") return;
  const userId = extractUserId(payload as Record<string, unknown>);
  if (!userId) return;

  const phones = new Set<string>();
  collectPhones(payload, phones);
  if (fallbackPhone) phones.add(fallbackPhone);

  for (const phone of phones) {
    upsertMappedUserId({
      tokenLabel: context.tokenLabel,
      clientId: context.clientId,
      phoneNumber: phone,
      userId,
    });
  }
}

function isYangoUserListRowDeleted(record: Record<string, unknown>): boolean {
  return record.is_deleted === true;
}

function rowToSuggestion(record: Record<string, unknown>): RequestRideUserSuggestion | null {
  const userId =
    asString(record.user_id) || asString(record.userId) || asString(record.id);
  if (!userId) return null;
  const fullName =
    asString(record.fullname) ||
    asString(record.full_name) ||
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

export async function resolveRequestRideUserIdByPhone(input: {
  tokenLabel: string;
  clientId: string;
  phoneNumber: string;
}): Promise<string | null> {
  const mapped = resolveMappedUserId(input);
  if (mapped) return mapped;

  const tokenConfig = resolveTokenConfig(input.tokenLabel);
  const variants = phoneVariants(input.phoneNumber);
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
        const userId = extractUserId(response);
        if (userId) return userId;
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
    return fromOfficialList;
  }

  const mappedAfterProbe = resolveMappedUserId(input);
  if (mappedAfterProbe) return mappedAfterProbe;
  if (permissionDenied) {
    throw new Error(
      "Selected API token has no permission to query users and no local phone->user_id mapping matched.",
    );
  }
  return null;
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

  const tokenConfig = resolveTokenConfig(input.tokenLabel);
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
  for (const item of mapped) {
    push({
      userId: item.userId,
      phone: item.phone,
      fullName: null,
      source: "map",
    });
  }

  if (byId.size < limit) {
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

export async function getRequestRideApiClients(): Promise<YangoApiClientRef[]> {
  const rows: YangoApiClientRef[] = [];
  await Promise.all(
    tokenConfigs.map(async (tokenConfig) => {
      if (!tokenConfig.token) return;
      try {
        const authResponse = await fetchJsonNoCache<YangoAuthListResponse>(
          `${YANGO_BASE_URL}/2.0/auth/list`,
          tokenConfig.token,
        );
        for (const client of authResponse.clients ?? []) {
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

export async function createRequestRide(payload: RequestRidePayload): Promise<RequestRideResult> {
  const tokenConfig = resolveTokenConfig(payload.tokenLabel);
  if (payload.userId?.trim() && payload.phoneNumber.trim()) {
    upsertMappedUserId({
      tokenLabel: payload.tokenLabel,
      clientId: payload.clientId,
      phoneNumber: payload.phoneNumber,
      userId: payload.userId,
    });
  }
  const endpoint = process.env.YANGO_CREATE_ORDER_ENDPOINT ?? "/2.0/orders/create";
  const createResponse = await fetchJsonNoCache<Record<string, unknown>>(
    `${YANGO_BASE_URL}${endpoint}`,
    tokenConfig.token,
    payload.clientId,
    {
      method: "POST",
      headers: {
        "X-Idempotency-Token": globalThis.crypto.randomUUID(),
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

/**
 * Cancels a scheduled/active order in the selected corp client context.
 * Override path with YANGO_CANCEL_ORDER_ENDPOINT if your tenant uses a different route.
 */
export async function cancelYangoOrder(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
}): Promise<void> {
  const tokenConfig = resolveTokenConfig(input.tokenLabel);
  const endpoint = process.env.YANGO_CANCEL_ORDER_ENDPOINT ?? "/2.0/orders/cancel";
  const bodies = [
    JSON.stringify({ order_id: input.orderId }),
    JSON.stringify({ orderId: input.orderId }),
  ];
  let lastError: Error | null = null;
  for (const body of bodies) {
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
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("Failed to cancel order.");
}

export async function getRequestRideStatus(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
}): Promise<RequestRideStatus> {
  const tokenConfig = resolveTokenConfig(input.tokenLabel);

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
  return {
    orderId: input.orderId,
    tokenLabel: input.tokenLabel,
    clientId: input.clientId,
    lifecycleStatus,
    statusRaw,
    statusText: progress?.status_text ?? reportRideStatus?.text ?? statusRaw,
    fetchedAt: new Date().toISOString(),
    driverName: performer?.fullname ?? null,
    driverPhone: performer?.phone ?? null,
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
