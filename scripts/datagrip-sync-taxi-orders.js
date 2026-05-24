require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

const SOURCE_NAME = "taxi_orders_created_window";
const UPSERT_BATCH = 500;
const DEFAULT_INITIAL_FROM = "2026-03-01T00:00:00.000Z";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function toIso(input) {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapRow(row) {
  const driverCost = toNumber(row.driver_cost);
  return {
    order_id: row.order_id,
    order_date: toIso(row.order_date),
    corp_client_id: row.corp_client_id ?? null,
    client_price: toNumber(row.client_price),
    driver_price_with_vat: driverCost === null ? null : driverCost * 1.18,
    actual_km: toNumber(row.actual_km),
    actual_minutes: toNumber(row.actual_minutes),
    updated_at: new Date().toISOString(),
  };
}

async function getSyncWindow(supabase) {
  const now = new Date().toISOString();
  const forcedFrom = process.env.TAXI_ORDERS_FORCE_FROM_TS;
  const forcedTo = process.env.TAXI_ORDERS_FORCE_TO_TS;
  if (forcedFrom || forcedTo) {
    return {
      fromTs: forcedFrom || DEFAULT_INITIAL_FROM,
      toTs: forcedTo || now,
    };
  }

  const { data, error } = await supabase
    .from("sync_state")
    .select("last_success_at")
    .eq("source_name", SOURCE_NAME)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read sync_state: ${error.message}`);
  }

  let fromTs = data?.last_success_at || DEFAULT_INITIAL_FROM;
  if (data?.last_success_at) {
    const overlapHoursRaw = Number(process.env.TAXI_ORDERS_SYNC_OVERLAP_HOURS ?? "24");
    const overlapHours =
      Number.isFinite(overlapHoursRaw) && overlapHoursRaw >= 0 ? overlapHoursRaw : 24;
    const shifted = new Date(new Date(fromTs).getTime() - overlapHours * 60 * 60 * 1000);
    if (!Number.isNaN(shifted.getTime())) {
      fromTs = shifted.toISOString();
    }
  }

  return { fromTs, toTs: now };
}

async function markSyncState(supabase, toTs) {
  const { error } = await supabase.from("sync_state").upsert(
    {
      source_name: SOURCE_NAME,
      last_success_at: toTs,
    },
    { onConflict: "source_name" },
  );
  if (error) {
    throw new Error(`Failed to upsert sync_state: ${error.message}`);
  }
}

async function logRunStart(supabase, fromTs, toTs) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      source_name: SOURCE_NAME,
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
    throw new Error(`Failed to insert sync_runs: ${error.message}`);
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
    throw new Error(`Failed to finalize sync_runs: ${error.message}`);
  }
}

async function upsertInBatches(supabase, rows) {
  let total = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from("taxi_orders").upsert(chunk, { onConflict: "order_id" });
    if (error) {
      throw new Error(`Failed to upsert taxi_orders: ${error.message}`);
    }
    total += chunk.length;
  }
  return total;
}

async function main() {
  const connection = loadDataGripConnection();
  const pg = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: getRequiredEnv("GREENPLUM_PASSWORD"),
    ssl:
      process.env.GREENPLUM_SSL_MODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 0,
  });
  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { fromTs, toTs } = await getSyncWindow(supabase);
  const runId = await logRunStart(supabase, fromTs, toTs);

  await pg.connect();
  try {
    const { rows } = await pg.query(
      `
      select
        lcl_order_created_dttm as order_date,
        order_id,
        corp_client_id,
        user_w_vat_cost as client_price,
        driver_cost,
        transporting_distance_fact_km as actual_km,
        transporting_time_fact_mnt as actual_minutes
      from taxi_cdm_order_rls_geo.fct_order
      where corp_order_flg = true
        and success_order_flg = true
        and lcl_order_created_dttm >= $1
        and lcl_order_created_dttm < $2
      order by lcl_order_created_dttm
      `,
      [fromTs, toTs],
    );

    const mapped = rows.map(mapRow).filter((row) => row.order_id && row.order_date);
    const rowsLoaded = mapped.length ? await upsertInBatches(supabase, mapped) : 0;
    await markSyncState(supabase, toTs);
    await logRunFinish(supabase, runId, "success", rowsLoaded, null);
    process.stdout.write(
      `Taxi orders sync finished. Window: ${fromTs} -> ${toTs}, rows upserted: ${rowsLoaded}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logRunFinish(supabase, runId, "failed", 0, message).catch(() => null);
    throw error;
  } finally {
    await pg.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
