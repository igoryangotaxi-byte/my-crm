import type {
  B2BDashboardOrder,
  B2BOrderDetailsResponse,
  PreOrder,
  TokenDiagnostics,
} from "@/types/crm";
import { unstable_cache } from "next/cache";

const YANGO_BASE_URL = "https://b2b-api.yango.com/integration";
const ORDERS_PAGE_LIMIT = 100;
const PREORDERS_CACHE_REVALIDATE_SECONDS = 30;
const B2B_DASHBOARD_CACHE_REVALIDATE_SECONDS = 60;

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

type YangoTaxiReportResponse = {
  orders?: YangoTaxiReportOrder[];
};

const tokenConfigs: TokenConfig[] = [
  {
    label: "SAMELET",
    token: process.env.YANGO_TOKEN_SAMELET ?? "",
  },
  {
    label: "SHUFERSAL",
    token: process.env.YANGO_TOKEN_SHUFERSAL ?? "",
  },
  {
    label: "APPLI TAXI",
    crmClientName: "APPLI TAXI",
    token: process.env.YANGO_TOKEN_APLI_TAXI_OZ ?? "",
  },
  {
    label: "RYDEMOBILITY",
    crmClientName: "RydeMobility",
    token: process.env.YANGO_TOKEN_RYDEMOBILITY ?? "",
  },
];

async function fetchJson<T>(
  url: string,
  token: string,
  clientId?: string,
  init?: RequestInit,
) {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(clientId ? { "X-YaTaxi-Selected-Corp-Client-Id": clientId } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body,
    next: { revalidate: PREORDERS_CACHE_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}

async function fetchJsonNoCache<T>(
  url: string,
  token: string,
  clientId?: string,
  init?: RequestInit,
) {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(clientId ? { "X-YaTaxi-Selected-Corp-Client-Id": clientId } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}

function normalizeDashboardStatus(rawStatus?: string): "completed" | "cancelled" | "pending" {
  const status = (rawStatus ?? "").toLowerCase();

  if (
    status === "complete" ||
    status === "completed" ||
    status === "finished" ||
    status === "transporting_finished"
  ) {
    return "completed";
  }

  if (status.includes("cancel")) {
    return "cancelled";
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
  let totalAmount = Infinity;
  const sinceDateTime = getSinceDateTime();

  while (offset < totalAmount) {
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
    totalAmount = response.total_amount ?? items.length;

    const futureOrders = items.filter((order) => isFutureDate(order.due_date));

    const orderDetailsList = await Promise.all(
      futureOrders.map((order) =>
        getOrderDetails(tokenConfig, client.client_id, order.id),
      ),
    );

    for (const [index, order] of futureOrders.entries()) {
      const orderDetails: YangoOrderInfoResponse | undefined =
        orderDetailsList[index];
      const performer: YangoPerformer | undefined = orderDetails?.performer;
      const names = splitDriverFullName(performer?.fullname);

      preOrders.push({
        id: `${tokenConfig.label}-${order.id}`,
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

    if (items.length === 0) {
      break;
    }

    offset += items.length;
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
  ["yango-preorders-v2"],
  { revalidate: PREORDERS_CACHE_REVALIDATE_SECONDS },
);

function getDashboardDefaultRange() {
  const till = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return { since: since.toISOString(), till: till.toISOString() };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function getClientDashboardOrders(
  tokenConfig: TokenConfig,
  client: YangoClient,
  sinceDateTime: string,
  tillDateTime: string,
) {
  const uniqueById = new Map<string, YangoOrder>();
  let offset = 0;
  let totalAmount = Infinity;

  while (offset < totalAmount) {
    const params = new URLSearchParams({
      limit: String(ORDERS_PAGE_LIMIT),
      offset: String(offset),
      sorting_field: "due_date",
      sorting_direction: "1",
      since_datetime: sinceDateTime,
      till_datetime: tillDateTime,
    });

    const response = await fetchJson<YangoOrderListResponse>(
      `${YANGO_BASE_URL}/2.0/orders/list?${params.toString()}`,
      tokenConfig.token,
      client.client_id,
    );

    const items = response.items ?? [];
    totalAmount = response.total_amount ?? items.length;

    for (const item of items) {
      uniqueById.set(item.id, item);
    }

    if (items.length === 0) {
      break;
    }
    offset += items.length;
  }

  const orderIds = [...uniqueById.keys()];
  const reportChunks = chunkArray(orderIds, 100);
  const reportOrdersById = new Map<string, YangoTaxiReportOrder>();

  for (const idsChunk of reportChunks) {
    try {
      const report = await fetchJson<YangoTaxiReportResponse>(
        `${YANGO_BASE_URL}/2.0/orders/taxi/report`,
        tokenConfig.token,
        client.client_id,
        {
          method: "POST",
          body: JSON.stringify({ ids: idsChunk }),
        },
      );

      for (const order of report.orders ?? []) {
        reportOrdersById.set(order.id, order);
      }
    } catch {
      // Keep partial data if report endpoint is unavailable.
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

    rows.push({
      orderId,
      tokenLabel: tokenConfig.label,
      clientId: client.client_id,
      clientName: tokenConfig.crmClientName ?? client.name,
      status: normalizeDashboardStatus(statusRaw),
      statusRaw,
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

async function loadB2BPreOrdersDashboardData() {
  const { since, till } = getDashboardDefaultRange();
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

export const getB2BPreOrdersDashboardData = unstable_cache(
  loadB2BPreOrdersDashboardData,
  ["yango-b2b-preorders-dashboard-v1"],
  { revalidate: B2B_DASHBOARD_CACHE_REVALIDATE_SECONDS },
);

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
