require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

const UPSERT_BATCH = 500;

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

function addDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, 0, 0, 0));
}

function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function mapRow(row) {
  return {
    order_id: row.order_id,
    etl_processed_dttm: toIso(row._etl_processed_dttm),
    utc_order_created_dttm: toIso(row.utc_order_created_dttm),
    lcl_order_due_dttm: toIso(row.lcl_order_due_dttm),
    utc_order_due_dttm: toIso(row.utc_order_due_dttm),
    utc_order_finished_dttm: toIso(row.utc_order_finished_dttm),
    utc_setcar_dttm: toIso(row.utc_setcar_dttm),
    utc_start_driving_dttm: toIso(row.utc_start_driving_dttm),
    utc_start_transporting_dttm: toIso(row.utc_start_transporting_dttm),
    source_address: row.source_address ?? null,
    destination_plan_address: row.destination_plan_address ?? null,
    corp_client_id: row.corp_client_id ?? null,
    park_client_id: row.park_client_id ?? null,
    park_client_name: row.park_client_name ?? null,
    corp_order_flg: row.corp_order_flg ?? null,
    corp_contract_id: row.corp_contract_id ?? null,
    corp_tariff_id: row.corp_tariff_id ?? null,
    corp_tariff_plan_id: row.corp_tariff_plan_id ?? null,
    user_tariff_id: row.user_tariff_id ?? null,
    operational_class_code: row.operational_class_code ?? null,
    tariff_class_code: row.tariff_class_code ?? null,
    success_order_flg: row.success_order_flg ?? null,
    driver_status: row.driver_status ?? null,
    user_status: row.user_status ?? null,
    paid_cancel_order_flg: row.paid_cancel_order_flg ?? null,
    cancel_reason_list: Array.isArray(row.cancel_reason_list) ? row.cancel_reason_list : null,
    request_payment_type: row.request_payment_type ?? null,
    fact_payment_type: row.fact_payment_type ?? null,
    currency_code: row.currency_code ?? null,
    currency_rate: row.currency_rate ?? null,
    user_w_vat_cost: row.user_w_vat_cost ?? null,
    driver_cost: row.driver_cost ?? null,
    order_cost: row.order_cost ?? null,
    b2b_order_cost: row.b2b_order_cost ?? null,
    order_wo_limit_cost: row.order_wo_limit_cost ?? null,
    b2b_order_wo_limit_cost: row.b2b_order_wo_limit_cost ?? null,
    order_before_surge_cost: row.order_before_surge_cost ?? null,
    b2b_order_before_surge_cost: row.b2b_order_before_surge_cost ?? null,
    decoupling_driver_cost: row.decoupling_driver_cost ?? null,
    decoupling_user_cost: row.decoupling_user_cost ?? null,
    decoupling_flg: row.decoupling_flg ?? null,
    decoupling_success_flg: row.decoupling_success_flg ?? null,
    transporting_distance_fact_km: row.transporting_distance_fact_km ?? null,
    transporting_distance_plan_km: row.transporting_distance_plan_km ?? null,
    transporting_time_fact_mnt: row.transporting_time_fact_mnt ?? null,
    transporting_time_plan_mnt: row.transporting_time_plan_mnt ?? null,
    travel_time_mnt: row.travel_time_mnt ?? null,
    order_completion_time_mnt: row.order_completion_time_mnt ?? null,
  };
}

async function upsertInBatches(supabase, rows) {
  let total = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("gp_fct_order_raw")
      .upsert(chunk, { onConflict: "order_id" });
    if (error) {
      throw new Error(`Failed to upsert chunk: ${error.message}`);
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

  const from = new Date("2026-01-01T00:00:00Z");
  const to = new Date("2026-05-01T00:00:00Z");
  const windowDays = Number(process.env.B2B_CREATED_SYNC_WINDOW_DAYS ?? "3");
  const windows = [];
  for (let cursor = new Date(from); cursor < to; cursor = addDays(cursor, windowDays)) {
    windows.push({ from: new Date(cursor), to: addDays(cursor, windowDays) });
  }

  await pg.connect();
  let totalLoaded = 0;
  try {
    for (let i = 0; i < windows.length; i += 1) {
      const w = windows[i];
      process.stdout.write(
        `[PROGRESS] step=${i + 1} total=${windows.length} message=Syncing ${dateKey(w.from)}\n`,
      );

      const { rows } = await pg.query(
        `
        select
          order_id,
          _etl_processed_dttm,
          utc_order_created_dttm,
          lcl_order_due_dttm,
          utc_order_due_dttm,
          utc_order_finished_dttm,
          utc_setcar_dttm,
          utc_start_driving_dttm,
          utc_start_transporting_dttm,
          source_address,
          destination_plan_address,
          corp_client_id,
          park_client_id,
          park_client_name,
          corp_order_flg,
          corp_contract_id,
          corp_tariff_id,
          corp_tariff_plan_id,
          user_tariff_id,
          operational_class_code,
          tariff_class_code,
          success_order_flg,
          driver_status,
          user_status,
          paid_cancel_order_flg,
          cancel_reason_list,
          request_payment_type,
          fact_payment_type,
          currency_code,
          currency_rate,
          user_w_vat_cost,
          driver_cost,
          order_cost,
          b2b_order_cost,
          order_wo_limit_cost,
          b2b_order_wo_limit_cost,
          order_before_surge_cost,
          b2b_order_before_surge_cost,
          decoupling_driver_cost,
          decoupling_user_cost,
          decoupling_flg,
          decoupling_success_flg,
          transporting_distance_fact_km,
          transporting_distance_plan_km,
          transporting_time_fact_mnt,
          transporting_time_plan_mnt,
          travel_time_mnt,
          order_completion_time_mnt
        from taxi_cdm_order_rls_geo.fct_order
        where corp_client_id is not null
          and msk_order_created_dt >= $1::date
          and msk_order_created_dt < $2::date
      `,
        [dateKey(w.from), dateKey(w.to)],
      );

      if (!rows.length) continue;
      const latestByOrder = new Map();
      for (const row of rows) {
        const prev = latestByOrder.get(row.order_id);
        if (!prev) {
          latestByOrder.set(row.order_id, row);
          continue;
        }
        const prevEtl = toIso(prev._etl_processed_dttm) ?? "";
        const nextEtl = toIso(row._etl_processed_dttm) ?? "";
        if (nextEtl > prevEtl) {
          latestByOrder.set(row.order_id, row);
        }
      }

      totalLoaded += await upsertInBatches(supabase, Array.from(latestByOrder.values()).map(mapRow));
    }

    process.stdout.write(`Sync completed. Rows upserted: ${totalLoaded}\n`);
  } finally {
    await pg.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
