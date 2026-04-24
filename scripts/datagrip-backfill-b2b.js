require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

const BACKFILL_SOURCE = "fct_order_b2b_backfill";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function toIso(input) {
  if (!input) {
    return null;
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function dayStart(input) {
  const date = input instanceof Date ? input : new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

function addDays(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + count, 0, 0, 0));
}

function dateLabel(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

async function upsertInBatches(supabase, table, rows, onConflict) {
  const chunkSize = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`Failed to upsert ${table}: ${error.message}`);
    }
    total += chunk.length;
  }
  return total;
}

async function logRunStart(supabase, sourceName, fromTs, toTs) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      source_name: sourceName,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "started",
      rows_loaded: 0,
      from_ts: fromTs,
      to_ts: toTs,
      error_text: null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert sync_runs start row: ${error.message}`);
  }
  return data.id;
}

async function logRunFinish(supabase, runId, status, rowsLoaded, errorText) {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      rows_loaded: rowsLoaded,
      error_text: errorText || null,
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`Failed to finalize sync_runs row: ${error.message}`);
  }
}

async function markSyncState(supabase, sourceName, toTs) {
  const { error } = await supabase.from("sync_state").upsert(
    {
      source_name: sourceName,
      last_success_at: toTs,
    },
    { onConflict: "source_name" },
  );

  if (error) {
    throw new Error(`Failed to upsert sync_state for ${sourceName}: ${error.message}`);
  }
}

async function loadWindow(pgClient, fromTs, toTs) {
  const query = `
    select
      order_id,
      _etl_processed_dttm,
      utc_order_created_dttm,
      lcl_order_due_dttm,
      source_address,
      destination_plan_address,
      corp_client_id,
      park_client_id,
      success_order_flg,
      driver_status,
      user_status,
      user_w_vat_cost,
      driver_cost,
      decoupling_driver_cost
    from taxi_cdm_order_rls_geo.fct_order
    where _etl_processed_dttm >= $1
      and _etl_processed_dttm < $2
      and corp_client_id is not null
  `;

  const { rows } = await pgClient.query(query, [fromTs, toTs]);
  const latestByOrder = new Map();
  for (const row of rows) {
    const key = row.order_id;
    const prev = latestByOrder.get(key);
    if (!prev) {
      latestByOrder.set(key, row);
      continue;
    }
    const prevEtl = toIso(prev._etl_processed_dttm) ?? "";
    const nextEtl = toIso(row._etl_processed_dttm) ?? "";
    if (nextEtl > prevEtl) {
      latestByOrder.set(key, row);
    }
  }

  return Array.from(latestByOrder.values()).map((row) => ({
      order_id: row.order_id,
      etl_processed_dttm: toIso(row._etl_processed_dttm),
      utc_order_created_dttm: toIso(row.utc_order_created_dttm),
      lcl_order_due_dttm: toIso(row.lcl_order_due_dttm),
      source_address: row.source_address ?? null,
      destination_plan_address: row.destination_plan_address ?? null,
      corp_client_id: row.corp_client_id ?? null,
      park_client_id: row.park_client_id ?? null,
      success_order_flg: row.success_order_flg ?? null,
      driver_status: row.driver_status ?? null,
      user_status: row.user_status ?? null,
      user_w_vat_cost: row.user_w_vat_cost ?? null,
      driver_cost: row.driver_cost ?? null,
      decoupling_driver_cost: row.decoupling_driver_cost ?? null,
    }));
}

async function main() {
  const connection = loadDataGripConnection();
  const password = getRequiredEnv("GREENPLUM_PASSWORD");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const fromEnv = process.env.B2B_BACKFILL_FROM ?? "2022-01-01T00:00:00Z";
  const toEnv = process.env.B2B_BACKFILL_TO ?? new Date().toISOString();
  const windowDaysRaw = Number(process.env.B2B_BACKFILL_WINDOW_DAYS ?? "7");
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : 14;

  let cursor = dayStart(fromEnv);
  const end = dayStart(toEnv);
  const windows = [];
  while (cursor <= end) {
    const next = addDays(cursor, windowDays);
    windows.push({ from: new Date(cursor), to: new Date(next) });
    cursor = next;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pgClient = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password,
    ssl:
      process.env.GREENPLUM_SSL_MODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 1000 * 60 * 10,
  });

  await pgClient.connect();
  const runId = await logRunStart(supabase, BACKFILL_SOURCE, toIso(fromEnv), toIso(toEnv));
  let totalLoaded = 0;

  try {
    for (let i = 0; i < windows.length; i += 1) {
      const window = windows[i];
      const label = `${dateLabel(window.from)}..${dateLabel(window.to)}`;
      process.stdout.write(
        `[PROGRESS] step=${i + 1} total=${windows.length} message=Backfilling ${label}\n`,
      );

      const mappedRows = await loadWindow(pgClient, toIso(window.from), toIso(window.to));
      if (!mappedRows.length) {
        continue;
      }

      const loaded = await upsertInBatches(
        supabase,
        "gp_fct_order_raw",
        mappedRows,
        "order_id",
      );
      totalLoaded += loaded;
    }

    await markSyncState(supabase, BACKFILL_SOURCE, toIso(toEnv));
    await logRunFinish(supabase, runId, "success", totalLoaded, null);
    process.stdout.write(
      `B2B backfill completed.\nwindow: ${toIso(fromEnv)} -> ${toIso(toEnv)}\nrows loaded: ${totalLoaded}\n`,
    );
  } catch (error) {
    await logRunFinish(
      supabase,
      runId,
      "failed",
      totalLoaded,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    await pgClient.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
