import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

const SUPABASE_REVALIDATE_SECONDS = 60;
const PAGE_SIZE = 1000;
const MAX_ROWS = Number(process.env.SUPABASE_METRICS_MAX_ROWS ?? "0");
const LOOKBACK_DAYS = Number(process.env.SUPABASE_METRICS_LOOKBACK_DAYS ?? "120");
const LOCAL_CACHE_TTL_MS = SUPABASE_REVALIDATE_SECONDS * 1000;

let inMemoryCache:
  | {
      updatedAt: number;
      rows: YangoSupabaseOrderMetric[];
    }
  | null = null;

function toNumberOrZero(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function loadCorpClientMap(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const map = new Map<string, string>();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("gp_corp_client_map")
      .select("corp_client_id,client_name")
      .order("corp_client_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      return new Map<string, string>();
    }
    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const corpClientId =
        typeof row.corp_client_id === "string"
          ? row.corp_client_id.trim().toLowerCase()
          : "";
      const clientName = typeof row.client_name === "string" ? row.client_name.trim() : "";
      if (corpClientId && clientName) {
        map.set(corpClientId, clientName);
      }
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return map;
}

export async function getCorpClientNameMap(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) {
    return {};
  }
  try {
    const supabase = getSupabaseAdminClient();
    const map = await loadCorpClientMap(supabase);
    return Object.fromEntries(map.entries());
  } catch {
    return {};
  }
}

function applyCorpClientMap(
  rows: YangoSupabaseOrderMetric[],
  corpClientMap: Map<string, string>,
): YangoSupabaseOrderMetric[] {
  return rows.map((row) => {
    const mappedName =
      row.corpClientId && row.corpClientId.length > 0
        ? corpClientMap.get(row.corpClientId.trim().toLowerCase())
        : null;
    if (!mappedName) {
      return row;
    }
    return {
      ...row,
      clientName: mappedName,
    };
  });
}

async function loadYangoSupabaseOrderMetrics(corpClientId?: string): Promise<YangoSupabaseOrderMetric[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const corpClientMap = await loadCorpClientMap(supabase);
  const rows: YangoSupabaseOrderMetric[] = [];
  let includeDecouplingFlg = true;
  const now = new Date();
  const safeLookback = Number.isFinite(LOOKBACK_DAYS) && LOOKBACK_DAYS > 0 ? LOOKBACK_DAYS : 120;
  const cutoff = new Date(now.getTime() - safeLookback * 24 * 60 * 60 * 1000).toISOString();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (MAX_ROWS > 0 && offset >= MAX_ROWS) {
      break;
    }
    const endOffset =
      MAX_ROWS > 0
        ? Math.min(offset + PAGE_SIZE - 1, MAX_ROWS - 1)
        : offset + PAGE_SIZE - 1;
    const selectBase =
      "order_id,lcl_order_due_dttm,corp_client_id,park_client_id,success_order_flg,user_status,driver_status,user_w_vat_cost,driver_cost,decoupling_driver_cost";
    const selectExpr = includeDecouplingFlg
      ? `${selectBase},decoupling_flg`
      : selectBase;

    const scoped = supabase
      .from("gp_fct_order_raw")
      .select(selectExpr)
      .not("corp_client_id", "is", null)
      .not("lcl_order_due_dttm", "is", null)
      .gte("lcl_order_due_dttm", cutoff);
    const baseResult = (corpClientId ? scoped.eq("corp_client_id", corpClientId) : scoped)
      .order("lcl_order_due_dttm", { ascending: false })
      .range(offset, endOffset);
    let data = (baseResult.data ?? null) as Array<Record<string, unknown>> | null;
    let error = baseResult.error;

    if (
      error &&
      includeDecouplingFlg &&
      error.message.toLowerCase().includes("decoupling_flg")
    ) {
      includeDecouplingFlg = false;
      const retry = await supabase
        .from("gp_fct_order_raw")
        .select(selectBase)
        .not("corp_client_id", "is", null)
        .not("lcl_order_due_dttm", "is", null)
        .gte("lcl_order_due_dttm", cutoff)
        .order("lcl_order_due_dttm", { ascending: false })
        .range(offset, endOffset);
      data = (retry.data ?? null) as Array<Record<string, unknown>> | null;
      error = retry.error;
    }

    if (error) {
      throw new Error(`Failed to load gp_fct_order_raw: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const orderId = typeof row.order_id === "string" ? row.order_id : "";
      const scheduledAt =
        typeof row.lcl_order_due_dttm === "string" ? row.lcl_order_due_dttm : "";
      if (!orderId || !scheduledAt) {
        continue;
      }
      const clientId =
        typeof row.corp_client_id === "string" && row.corp_client_id
          ? row.corp_client_id
          : typeof row.park_client_id === "string" && row.park_client_id
            ? row.park_client_id
            : null;
      const corpClientId =
        typeof row.corp_client_id === "string" ? row.corp_client_id : null;
      const userStatus =
        typeof row.user_status === "string" ? row.user_status : null;
      const driverStatus =
        typeof row.driver_status === "string" ? row.driver_status : null;

      rows.push({
        orderId,
        scheduledAt,
        clientId,
        corpClientId,
        clientName:
          (corpClientId ? corpClientMap.get(corpClientId.trim().toLowerCase()) : null) ??
          clientId ??
          "Unknown client",
        decouplingFlg: typeof row.decoupling_flg === "boolean" ? row.decoupling_flg : null,
        statusRaw: [userStatus, driverStatus].filter(Boolean).join(" | "),
        successOrderFlag:
          typeof row.success_order_flg === "boolean" ? row.success_order_flg : null,
        userStatus,
        driverStatus,
        clientPaid: toNumberOrZero(row.user_w_vat_cost),
        driverReceived: toNumberOrZero(row.driver_cost),
        decoupling: toNumberOrZero(row.decoupling_driver_cost),
      });
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

export async function getYangoSupabaseOrderMetrics(corpClientId?: string): Promise<YangoSupabaseOrderMetric[]> {
  if (corpClientId) {
    return loadYangoSupabaseOrderMetrics(corpClientId);
  }
  const supabase = getSupabaseAdminClient();
  const corpClientMap = await loadCorpClientMap(supabase);
  const now = Date.now();
  if (inMemoryCache && now - inMemoryCache.updatedAt < LOCAL_CACHE_TTL_MS) {
    return applyCorpClientMap(inMemoryCache.rows, corpClientMap);
  }

  const rows = await loadYangoSupabaseOrderMetrics();
  const mappedRows = applyCorpClientMap(rows, corpClientMap);
  inMemoryCache = {
    updatedAt: now,
    rows: mappedRows,
  };
  return mappedRows;
}
