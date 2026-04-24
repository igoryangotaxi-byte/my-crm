require("dotenv").config({ path: ".env.local", quiet: true });

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { createClient } = require("@supabase/supabase-js");

const BATCH_SIZE = 500;
const SOURCE_UTC_OFFSET_HOURS = Number(process.env.B2B_IMPORT_SOURCE_UTC_OFFSET_HOURS ?? "0");

const CSV_COLUMNS = [
  "order_date",
  "trip_datetime",
  "etl_processed_dttm",
  "_etl_processed_dttm",
  "client_id",
  "corp_client_id",
  "order_id",
  "client_price",
  "driver_price",
  "decoupling_amount",
  "success_order_flg",
  "decoupling_flg",
  "tariff_class_code",
  "transporting_distance_fact_km",
  "actual_distance_km",
  "transporting_time_fact_mnt",
  "actual_time_minutes",
  "currency_code",
  "park_name",
  "park_client_id",
  "source_address",
  "destination_plan_address",
  "cancel_reason_list",
];

const LEGACY_NO_HEADER_COLUMNS = [
  "order_date",
  "client_id",
  "order_id",
  "client_price",
  "driver_price",
  "decoupling_amount",
  "success_order_flg",
  "decoupling_flg",
  "service_commission",
  "park_commission",
  "subsidy_value",
  "tariff_class_code",
  "transporting_distance_fact_km",
  "transporting_time_fact_mnt",
  "currency_code",
  "driver_full_name",
  "first_name",
  "last_name",
  "driver_birth_date",
  "driver_loyalty_status",
  "park_name",
  "park_client_id",
  "car_profile_brand_name",
  "car_profile_model_name",
  "car_profile_year",
  "car_profile_plate_id",
  "driver_work_status",
  "source_address",
  "destination_plan_address",
  "source_lat",
  "source_lon",
  "destination_plan_lat",
  "destination_plan_lon",
  "to_airport_flg",
  "from_airport_flg",
  "cancel_reason_list",
];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

function toNumberOrNull(value) {
  const text = normalizeString(value);
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function toBoolOrNull(value) {
  const text = normalizeString(value);
  if (!text) return null;
  if (text.toLowerCase() === "true") return true;
  if (text.toLowerCase() === "false") return false;
  return null;
}

function toIsoOrNull(value) {
  const text = normalizeString(value);
  if (!text) return null;
  const candidate = text.includes("T") ? text : text.replace(" ", "T");
  const withZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(candidate)
    ? candidate
    : `${candidate}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shiftIsoByHours(iso, hours) {
  if (!iso || !Number.isFinite(hours) || hours === 0) return iso;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  return new Date(ts + hours * 60 * 60 * 1000).toISOString();
}

function parsePgArrayText(value) {
  const text = normalizeString(value);
  if (!text) return null;
  if (text === "{}") return [];
  if (!text.startsWith("{") || !text.endsWith("}")) return [text];
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((item) => item.trim().replace(/^"+|"+$/g, ""))
    .filter(Boolean);
}

function readField(item, ...keys) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function mapCsvRecord(record) {
  const item = {};
  if (Array.isArray(record)) {
    const looksLikeLegacyNoHeader =
      record.length >= LEGACY_NO_HEADER_COLUMNS.length &&
      typeof record[1] === "string" &&
      typeof record[2] === "string" &&
      /^[a-f0-9]{32}$/i.test(record[1]) &&
      /^[a-f0-9]{32}$/i.test(record[2]);
    const arrayColumns = looksLikeLegacyNoHeader ? LEGACY_NO_HEADER_COLUMNS : CSV_COLUMNS;
    for (let i = 0; i < arrayColumns.length; i += 1) {
      item[arrayColumns[i]] = record[i] ?? null;
    }
  } else {
    for (const key of CSV_COLUMNS) {
      item[key] = record[key] ?? null;
    }
    for (const [key, value] of Object.entries(record)) {
      if (!(key in item)) {
        item[key] = value;
      }
    }
  }

  const scheduledAtUtc = toIsoOrNull(readField(item, "order_date", "trip_datetime"));
  const scheduledAt = shiftIsoByHours(scheduledAtUtc, SOURCE_UTC_OFFSET_HOURS);
  const etlProcessedAt =
    toIsoOrNull(readField(item, "_etl_processed_dttm", "etl_processed_dttm")) ?? scheduledAt;
  const clientPrice = toNumberOrNull(readField(item, "client_price"));
  const driverPriceWithVat = toNumberOrNull(readField(item, "driver_price"));
  const explicitDecoupling = toNumberOrNull(readField(item, "decoupling_amount"));
  const decouplingAmount =
    explicitDecoupling ??
    (clientPrice !== null && driverPriceWithVat !== null ? clientPrice - driverPriceWithVat : null);

  return {
    order_id: normalizeString(readField(item, "order_id")),
    etl_processed_dttm: etlProcessedAt,
    lcl_order_due_dttm: scheduledAt,
    utc_order_created_dttm: scheduledAtUtc,
    corp_client_id: normalizeString(readField(item, "corp_client_id", "client_id")),
    park_client_id: normalizeString(readField(item, "park_client_id")),
    park_client_name: normalizeString(readField(item, "park_name")),
    source_address: normalizeString(readField(item, "source_address")),
    destination_plan_address: normalizeString(readField(item, "destination_plan_address")),
    success_order_flg: toBoolOrNull(readField(item, "success_order_flg")),
    decoupling_flg: toBoolOrNull(readField(item, "decoupling_flg")),
    tariff_class_code: normalizeString(readField(item, "tariff_class_code")),
    currency_code: normalizeString(readField(item, "currency_code")),
    user_w_vat_cost: clientPrice,
    driver_cost: driverPriceWithVat,
    order_cost: clientPrice,
    b2b_order_cost: clientPrice,
    decoupling_driver_cost: decouplingAmount,
    decoupling_user_cost: decouplingAmount,
    transporting_distance_fact_km: toNumberOrNull(
      readField(item, "transporting_distance_fact_km", "actual_distance_km"),
    ),
    transporting_time_fact_mnt: toNumberOrNull(
      readField(item, "transporting_time_fact_mnt", "actual_time_minutes"),
    ),
    cancel_reason_list: parsePgArrayText(readField(item, "cancel_reason_list")),
  };
}

async function upsertBatch(supabase, rows) {
  const validRows = rows.filter((row) => row.order_id);
  if (!validRows.length) return 0;
  const { error } = await supabase
    .from("gp_fct_order_raw")
    .upsert(validRows, { onConflict: "order_id" });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  return validRows.length;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: node scripts/import-b2b-csv-to-supabase.js <absolute_csv_path>");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file does not exist: ${filePath}`);
  }

  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let totalRead = 0;
  let totalUpserted = 0;
  let skippedEmptyOrderId = 0;
  let duplicateRowsCollapsed = 0;
  const latestByOrder = new Map();

  const parser = fs
    .createReadStream(filePath, { encoding: "utf8" })
    .pipe(
      parse({
        columns: false,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: false,
      }),
    );

  let skippedHeaderRows = 0;
  for await (const record of parser) {
    if (
      !record ||
      (Array.isArray(record) && record.length === 0) ||
      (!Array.isArray(record) && Object.keys(record).length === 0)
    ) {
      continue;
    }
    if (Array.isArray(record)) {
      const first = normalizeString(record[0])?.toLowerCase() ?? "";
      const second = normalizeString(record[1])?.toLowerCase() ?? "";
      if (
        first === "order_date" ||
        first === "trip_datetime" ||
        second === "order_id" ||
        first === "dt"
      ) {
        skippedHeaderRows += 1;
        continue;
      }
    }
    totalRead += 1;
    const mapped = mapCsvRecord(record);
    if (!mapped.order_id) {
      skippedEmptyOrderId += 1;
      continue;
    }
    const prev = latestByOrder.get(mapped.order_id);
    if (!prev) {
      latestByOrder.set(mapped.order_id, mapped);
      continue;
    }
    const prevTs = new Date(prev.etl_processed_dttm ?? prev.lcl_order_due_dttm ?? 0).getTime();
    const nextTs = new Date(
      mapped.etl_processed_dttm ?? mapped.lcl_order_due_dttm ?? 0,
    ).getTime();
    if (!Number.isNaN(nextTs) && (Number.isNaN(prevTs) || nextTs >= prevTs)) {
      latestByOrder.set(mapped.order_id, mapped);
    }
    duplicateRowsCollapsed += 1;
  }

  let batch = [];
  const dedupedRows = [...latestByOrder.values()];
  for (const row of dedupedRows) {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      totalUpserted += await upsertBatch(supabase, batch);
      process.stdout.write(`Imported rows: ${totalUpserted}\n`);
      batch = [];
    }
  }

  if (batch.length) {
    totalUpserted += await upsertBatch(supabase, batch);
  }

  process.stdout.write(
    `Import finished. Read: ${totalRead}, unique: ${dedupedRows.length}, upserted: ${totalUpserted}, duplicates_collapsed: ${duplicateRowsCollapsed}, skipped_empty_order_id: ${skippedEmptyOrderId}, skipped_headers: ${skippedHeaderRows}, source_utc_offset_hours: ${SOURCE_UTC_OFFSET_HOURS}, file: ${filePath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
