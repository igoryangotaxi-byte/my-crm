require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

const FCT_SOURCE = "fct_order_b2b_created_window";
const AGG_SOURCE = "agg_executor_profile_daily_snp";
const ACCESSIBLE_TABLES_SOURCE = "greenplum_accessible_tables";

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

async function getDestinationColumns(supabase, tableName) {
  const { data, error } = await supabase.from(tableName).select("*").limit(1);
  if (error) {
    throw new Error(`Failed to inspect ${tableName} columns: ${error.message}`);
  }
  if (!data || data.length === 0) {
    return new Set([
      "order_id",
      "etl_processed_dttm",
      "utc_order_created_dttm",
      "lcl_order_due_dttm",
      "source_address",
      "destination_plan_address",
      "corp_client_id",
      "park_client_id",
      "park_client_name",
      "corp_order_flg",
      "success_order_flg",
      "driver_status",
      "user_status",
      "user_w_vat_cost",
      "driver_cost",
      "order_cost",
      "b2b_order_cost",
      "decoupling_driver_cost",
      "decoupling_user_cost",
      "decoupling_flg",
      "cancel_reason_list",
      "currency_code",
      "transporting_distance_fact_km",
      "transporting_time_fact_mnt",
      "tariff_class_code",
    ]);
  }
  return new Set(Object.keys(data[0]));
}

function pickKnownColumns(row, allowedColumns) {
  if (!allowedColumns) {
    return row;
  }
  const output = {};
  for (const key of Object.keys(row)) {
    if (allowedColumns.has(key)) {
      output[key] = row[key];
    }
  }
  return output;
}

async function getSyncWindow(supabase, sourceName) {
  const defaultFrom =
    sourceName === FCT_SOURCE
      ? (process.env.B2B_SYNC_INITIAL_FROM ?? "2026-01-01T00:00:00Z")
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const forcedFrom =
    sourceName === FCT_SOURCE ? process.env.FCT_FORCE_FROM_TS : undefined;
  const forcedTo =
    sourceName === FCT_SOURCE ? process.env.FCT_FORCE_TO_TS : undefined;

  if (forcedFrom || forcedTo) {
    return {
      fromTs: forcedFrom || defaultFrom,
      toTs: forcedTo || now,
    };
  }

  const { data, error } = await supabase
    .from("sync_state")
    .select("last_success_at")
    .eq("source_name", sourceName)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read sync_state for ${sourceName}: ${error.message}`);
  }

  let fromTs = data?.last_success_at || defaultFrom;
  if (sourceName === FCT_SOURCE && data?.last_success_at) {
    const overlapHoursRaw = Number(process.env.B2B_SYNC_OVERLAP_HOURS ?? "2");
    const overlapHours = Number.isFinite(overlapHoursRaw) && overlapHoursRaw >= 0
      ? overlapHoursRaw
      : 2;
    const shifted = new Date(new Date(fromTs).getTime() - overlapHours * 60 * 60 * 1000);
    if (!Number.isNaN(shifted.getTime())) {
      fromTs = shifted.toISOString();
    }
  }

  return {
    fromTs,
    toTs: now,
  };
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

async function logRunStart(supabase, sourceName, fromTs, toTs) {
  const startedAt = new Date().toISOString();
  const payload = {
    source_name: sourceName,
    started_at: startedAt,
    finished_at: null,
    status: "started",
    rows_loaded: 0,
    from_ts: fromTs,
    to_ts: toTs,
    error_text: null,
  };

  const { data, error } = await supabase
    .from("sync_runs")
    .insert(payload)
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

async function syncFctOrder(pgClient, supabase) {
  const { fromTs, toTs } = await getSyncWindow(supabase, FCT_SOURCE);
  const runId = await logRunStart(supabase, FCT_SOURCE, fromTs, toTs);
  const destinationColumns = await getDestinationColumns(supabase, "gp_fct_order_raw");

  try {
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
        decoupling_driver_cost,
        order_cost,
        b2b_order_cost,
        order_wo_limit_cost,
        b2b_order_wo_limit_cost,
        order_before_surge_cost,
        b2b_order_before_surge_cost,
        decoupling_user_cost,
        decoupling_flg,
        decoupling_success_flg,
        paid_cancel_order_flg,
        cancel_reason_list,
        request_payment_type,
        fact_payment_type,
        currency_code,
        currency_rate,
        transporting_distance_fact_km,
        transporting_distance_plan_km,
        transporting_time_fact_mnt,
        transporting_time_plan_mnt,
        travel_time_mnt,
        order_completion_time_mnt,
        utc_order_due_dttm,
        utc_order_finished_dttm,
        utc_setcar_dttm,
        utc_start_driving_dttm,
        utc_start_transporting_dttm,
        park_client_name,
        corp_order_flg,
        corp_contract_id,
        corp_tariff_id,
        corp_tariff_plan_id,
        user_tariff_id,
        operational_class_code,
        tariff_class_code
      from taxi_cdm_order_rls_geo.fct_order
      where corp_order_flg = true
        and _etl_processed_dttm >= $1
        and _etl_processed_dttm < $2
    `;

    const { rows } = await pgClient.query(query, [fromTs, toTs]);
    const mapped = rows.map((row) => ({
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
      order_cost: row.order_cost ?? null,
      b2b_order_cost: row.b2b_order_cost ?? null,
      order_wo_limit_cost: row.order_wo_limit_cost ?? null,
      b2b_order_wo_limit_cost: row.b2b_order_wo_limit_cost ?? null,
      order_before_surge_cost: row.order_before_surge_cost ?? null,
      b2b_order_before_surge_cost: row.b2b_order_before_surge_cost ?? null,
      decoupling_user_cost: row.decoupling_user_cost ?? null,
      decoupling_flg: row.decoupling_flg ?? null,
      decoupling_success_flg: row.decoupling_success_flg ?? null,
      paid_cancel_order_flg: row.paid_cancel_order_flg ?? null,
      cancel_reason_list: Array.isArray(row.cancel_reason_list)
        ? row.cancel_reason_list
        : null,
      request_payment_type: row.request_payment_type ?? null,
      fact_payment_type: row.fact_payment_type ?? null,
      currency_code: row.currency_code ?? null,
      currency_rate: row.currency_rate ?? null,
      transporting_distance_fact_km: row.transporting_distance_fact_km ?? null,
      transporting_distance_plan_km: row.transporting_distance_plan_km ?? null,
      transporting_time_fact_mnt: row.transporting_time_fact_mnt ?? null,
      transporting_time_plan_mnt: row.transporting_time_plan_mnt ?? null,
      travel_time_mnt: row.travel_time_mnt ?? null,
      order_completion_time_mnt: row.order_completion_time_mnt ?? null,
      utc_order_due_dttm: toIso(row.utc_order_due_dttm),
      utc_order_finished_dttm: toIso(row.utc_order_finished_dttm),
      utc_setcar_dttm: toIso(row.utc_setcar_dttm),
      utc_start_driving_dttm: toIso(row.utc_start_driving_dttm),
      utc_start_transporting_dttm: toIso(row.utc_start_transporting_dttm),
      park_client_name: row.park_client_name ?? null,
      corp_order_flg: row.corp_order_flg ?? null,
      corp_contract_id: row.corp_contract_id ?? null,
      corp_tariff_id: row.corp_tariff_id ?? null,
      corp_tariff_plan_id: row.corp_tariff_plan_id ?? null,
      user_tariff_id: row.user_tariff_id ?? null,
      operational_class_code: row.operational_class_code ?? null,
      tariff_class_code: row.tariff_class_code ?? null,
    })).map((row) => pickKnownColumns(row, destinationColumns));

    const rowsLoaded = mapped.length
      ? await upsertInBatches(supabase, "gp_fct_order_raw", mapped, "order_id")
      : 0;

    await markSyncState(supabase, FCT_SOURCE, toTs);
    await logRunFinish(supabase, runId, "success", rowsLoaded, null);
    return { rowsLoaded, fromTs, toTs };
  } catch (error) {
    await logRunFinish(
      supabase,
      runId,
      "failed",
      0,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

async function syncAggExecutor(pgClient, supabase) {
  const enabled = process.env.ENABLE_SYNC_AGG_EXECUTOR === "true";
  if (!enabled) {
    return { rowsLoaded: 0, fromTs: null, toTs: null };
  }

  const { fromTs, toTs } = await getSyncWindow(supabase, AGG_SOURCE);
  const runId = await logRunStart(supabase, AGG_SOURCE, fromTs, toTs);

  try {
    const query = `
      select
        executor_profile_sk,
        utc_business_dttm,
        park_client_id,
        park_city_name,
        success_order_cnt,
        total_order_cnt,
        user_cost_rub,
        driver_income_rub,
        driver_net_income_incl_paid_cancel_rub_amt,
        subsidy_rub_value,
        order_commission_rub
      from taxi_cdm_executor_rls_geo.agg_executor_profile_daily_snp
      where utc_business_dttm > $1
        and utc_business_dttm <= $2
    `;

    const { rows } = await pgClient.query(query, [fromTs, toTs]);
    const mapped = rows.map((row) => ({
      executor_profile_sk: row.executor_profile_sk,
      utc_business_dttm: toIso(row.utc_business_dttm),
      park_client_id: row.park_client_id ?? null,
      park_city_name: row.park_city_name ?? null,
      success_order_cnt: row.success_order_cnt ?? null,
      total_order_cnt: row.total_order_cnt ?? null,
      user_cost_rub: row.user_cost_rub ?? null,
      driver_income_rub: row.driver_income_rub ?? null,
      driver_net_income_incl_paid_cancel_rub_amt:
        row.driver_net_income_incl_paid_cancel_rub_amt ?? null,
      subsidy_rub_value: row.subsidy_rub_value ?? null,
      order_commission_rub: row.order_commission_rub ?? null,
    }));

    const rowsLoaded = mapped.length
      ? await upsertInBatches(
          supabase,
          "gp_agg_executor_daily_raw",
          mapped,
          "executor_profile_sk,utc_business_dttm",
        )
      : 0;

    await markSyncState(supabase, AGG_SOURCE, toTs);
    await logRunFinish(supabase, runId, "success", rowsLoaded, null);
    return { rowsLoaded, fromTs, toTs };
  } catch (error) {
    await logRunFinish(
      supabase,
      runId,
      "failed",
      0,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

async function syncAccessibleTablesSnapshot(pgClient, supabase) {
  const snapshotAt = new Date().toISOString();
  const runId = await logRunStart(supabase, ACCESSIBLE_TABLES_SOURCE, null, null);

  try {
    const query = `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
        and has_schema_privilege(current_user, table_schema, 'USAGE')
        and has_table_privilege(format('%I.%I', table_schema, table_name), 'SELECT')
      order by table_schema, table_name
    `;

    const { rows } = await pgClient.query(query);
    const mapped = rows.map((row) => ({
      snapshot_at: snapshotAt,
      table_schema: row.table_schema,
      table_name: row.table_name,
    }));

    const rowsLoaded = mapped.length
      ? await upsertInBatches(
          supabase,
          "gp_accessible_tables",
          mapped,
          "snapshot_at,table_schema,table_name",
        )
      : 0;

    await logRunFinish(supabase, runId, "success", rowsLoaded, null);
    return { rowsLoaded, snapshotAt };
  } catch (error) {
    await logRunFinish(
      supabase,
      runId,
      "failed",
      0,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

async function main() {
  const connection = loadDataGripConnection();
  const password = getRequiredEnv("GREENPLUM_PASSWORD");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

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
  try {
    process.stdout.write("[PROGRESS] step=1 total=3 message=Syncing fct_order...\n");
    const fctResult = await syncFctOrder(pgClient, supabase);
    process.stdout.write("[PROGRESS] step=2 total=3 message=Syncing agg_executor_profile_daily_snp...\n");
    const aggResult = await syncAggExecutor(pgClient, supabase);
    let tablesResult = null;
    let tablesWarning = null;

    try {
      process.stdout.write("[PROGRESS] step=3 total=3 message=Saving accessible tables snapshot...\n");
      tablesResult = await syncAccessibleTablesSnapshot(pgClient, supabase);
    } catch (error) {
      tablesWarning = error instanceof Error ? error.message : String(error);
    }

    process.stdout.write(
      `Sync completed.\n` +
        `fct_order window: ${fctResult.fromTs} -> ${fctResult.toTs}, rows: ${fctResult.rowsLoaded}\n` +
        `agg_executor_profile_daily_snp window: ${aggResult.fromTs ?? "disabled"} -> ${aggResult.toTs ?? "disabled"}, rows: ${aggResult.rowsLoaded}\n` +
        `greenplum_accessible_tables snapshot: ${tablesResult?.snapshotAt ?? "failed"}, rows: ${tablesResult?.rowsLoaded ?? 0}\n` +
        (tablesWarning ? `greenplum_accessible_tables warning: ${tablesWarning}\n` : ""),
    );
  } finally {
    await pgClient.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
