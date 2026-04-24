import { createClient } from "@supabase/supabase-js";

type SupabaseConnectionStatus = {
  configured: boolean;
  reachable: boolean;
  message: string;
};

export type LastSyncSummary = {
  sourceName: string;
  fromTs: string | null;
  toTs: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  rowsLoaded: number;
  status: string;
} | null;

export type UnmappedCorpClientSummary = {
  corpClientId: string;
  lastSeenAt: string | null;
  ordersInSample: number;
};

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey() && getSupabaseServiceRoleKey());
}

export function getSupabaseServerClient() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      "Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const serviceRole = getSupabaseServiceRoleKey();

  if (!url || !serviceRole) {
    throw new Error(
      "Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getSupabaseConnectionStatus(): Promise<SupabaseConnectionStatus> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      message:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  try {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const response = await fetch(`${getSupabaseUrl()}/rest/v1/`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        configured: true,
        reachable: false,
        message: `Supabase configured, but REST endpoint returned HTTP ${response.status}.`,
      };
    }

    return {
      configured: true,
      reachable: true,
      message: "Supabase is connected and reachable.",
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message:
        error instanceof Error
          ? `Supabase connection failed: ${error.message}`
          : "Supabase connection failed.",
    };
  }
}

export async function getLastSuccessfulSyncSummary(
  sourceName = "fct_order_b2b_created_window",
): Promise<LastSyncSummary> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("sync_runs")
      .select("source_name,from_ts,to_ts,started_at,finished_at,rows_loaded,status")
      .eq("source_name", sourceName)
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      sourceName: data.source_name,
      fromTs: data.from_ts,
      toTs: data.to_ts,
      startedAt: data.started_at,
      finishedAt: data.finished_at,
      rowsLoaded: Number(data.rows_loaded ?? 0),
      status: data.status,
    };
  } catch {
    return null;
  }
}

export async function getRecentUnmappedCorpClients({
  sampleSize = 5000,
  limit = 50,
}: {
  sampleSize?: number;
  limit?: number;
} = {}): Promise<UnmappedCorpClientSummary[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const supabase = getSupabaseAdminClient();
    const safeSampleSize = Math.max(100, Math.min(sampleSize, 20000));
    const safeLimit = Math.max(1, Math.min(limit, 5000));

    const { data: orderRows, error: orderError } = await supabase
      .from("gp_fct_order_raw")
      .select("corp_client_id,lcl_order_due_dttm")
      .not("corp_client_id", "is", null)
      .order("lcl_order_due_dttm", { ascending: false })
      .limit(safeSampleSize);

    if (orderError || !orderRows || orderRows.length === 0) {
      return [];
    }

    const statsById = new Map<string, UnmappedCorpClientSummary>();
    for (const row of orderRows) {
      const corpClientId = String(row.corp_client_id ?? "").trim();
      if (!corpClientId) continue;
      const lastSeenAt =
        typeof row.lcl_order_due_dttm === "string" ? row.lcl_order_due_dttm : null;
      const existing = statsById.get(corpClientId);
      if (!existing) {
        statsById.set(corpClientId, {
          corpClientId,
          lastSeenAt,
          ordersInSample: 1,
        });
      } else {
        existing.ordersInSample += 1;
        if (lastSeenAt && (!existing.lastSeenAt || lastSeenAt > existing.lastSeenAt)) {
          existing.lastSeenAt = lastSeenAt;
        }
      }
    }

    const ids = [...statsById.keys()];
    if (ids.length === 0) {
      return [];
    }

    const { data: mappedRows, error: mappedError } = await supabase
      .from("gp_corp_client_map")
      .select("corp_client_id")
      .in("corp_client_id", ids);

    if (mappedError) {
      return [];
    }

    const mappedSet = new Set(
      (mappedRows ?? [])
        .map((row) => String(row.corp_client_id ?? "").trim())
        .filter(Boolean),
    );

    return ids
      .filter((id) => !mappedSet.has(id))
      .map((id) => statsById.get(id))
      .filter((row): row is UnmappedCorpClientSummary => Boolean(row))
      .sort((a, b) => {
        const aTs = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bTs = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return bTs - aTs;
      })
      .slice(0, safeLimit);
  } catch {
    return [];
  }
}
