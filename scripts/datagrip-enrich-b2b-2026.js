require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

const PAGE_SIZE = 1000;
const QUERY_BATCH = 25;
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

async function fetchOrderIds2026(supabase) {
  const orderIds = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select("order_id")
      .not("corp_client_id", "is", null)
      .gte("lcl_order_due_dttm", "2026-01-01T00:00:00Z")
      .lt("lcl_order_due_dttm", "2027-01-01T00:00:00Z")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to read 2026 order ids from Supabase: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.order_id) orderIds.push(row.order_id);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return orderIds;
}

async function upsertInBatches(supabase, rows) {
  let total = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("gp_fct_order_raw")
      .upsert(chunk, { onConflict: "order_id" });
    if (error) {
      throw new Error(`Failed to upsert enriched rows: ${error.message}`);
    }
    total += chunk.length;
  }
  return total;
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

async function main() {
  const connection = loadDataGripConnection();
  const password = getRequiredEnv("GREENPLUM_PASSWORD");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pg = new Client({
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
    statement_timeout: 1000 * 60 * 2,
  });

  await pg.connect();
  try {
    const orderIds = await fetchOrderIds2026(supabase);
    process.stdout.write(`Found ${orderIds.length} B2B order_ids for 2026 in Supabase.\n`);

    let totalUpdated = 0;
    const totalBatches = Math.ceil(orderIds.length / QUERY_BATCH);
    for (let i = 0; i < orderIds.length; i += QUERY_BATCH) {
      const batch = orderIds.slice(i, i + QUERY_BATCH);
      process.stdout.write(
        `[PROGRESS] step=${Math.floor(i / QUERY_BATCH) + 1} total=${totalBatches} message=Enriching batch\n`,
      );

      const { rows } = await pg.query(
        `
          select distinct on (order_id)
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
          where order_id = any($1::text[])
          order by order_id, _etl_processed_dttm desc
        `,
        [batch],
      );

      const mapped = rows.map(mapRow);
      if (mapped.length > 0) {
        totalUpdated += await upsertInBatches(supabase, mapped);
      }
    }

    process.stdout.write(`Enrichment completed. Updated rows: ${totalUpdated}\n`);
  } finally {
    await pg.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
