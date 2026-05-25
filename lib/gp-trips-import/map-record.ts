export const CSV_COLUMNS = [
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
] as const;

export const LEGACY_NO_HEADER_COLUMNS = [
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
] as const;

export type GpFctOrderRawRow = {
  order_id: string | null;
  etl_processed_dttm: string | null;
  lcl_order_due_dttm: string | null;
  utc_order_created_dttm: string | null;
  corp_client_id: string | null;
  park_client_id: string | null;
  park_client_name: string | null;
  source_address: string | null;
  destination_plan_address: string | null;
  success_order_flg: boolean | null;
  decoupling_flg: boolean | null;
  tariff_class_code: string | null;
  currency_code: string | null;
  user_w_vat_cost: number | null;
  driver_cost: number | null;
  order_cost: number | null;
  b2b_order_cost: number | null;
  decoupling_driver_cost: number | null;
  decoupling_user_cost: number | null;
  transporting_distance_fact_km: number | null;
  transporting_time_fact_mnt: number | null;
  cancel_reason_list: string[] | null;
};

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

function toNumberOrNull(value: unknown): number | null {
  const text = normalizeString(value);
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function toBoolOrNull(value: unknown): boolean | null {
  const text = normalizeString(value);
  if (!text) return null;
  if (text.toLowerCase() === "true") return true;
  if (text.toLowerCase() === "false") return false;
  return null;
}

function toIsoOrNull(value: unknown): string | null {
  const text = normalizeString(value);
  if (!text) return null;
  const plain = text.replace("T", " ");
  const m = plain.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
  );
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6] ?? "0");
    const ms = Number((m[7] ?? "0").padEnd(3, "0"));
    const localDate = new Date(year, month, day, hour, minute, second, ms);
    return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePgArrayText(value: unknown): string[] | null {
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

function readField(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

export function isCsvHeaderRow(record: string[]): boolean {
  const first = normalizeString(record[0])?.toLowerCase() ?? "";
  const second = normalizeString(record[1])?.toLowerCase() ?? "";
  return (
    first === "order_date" ||
    first === "trip_datetime" ||
    second === "order_id" ||
    first === "dt"
  );
}

export function mapCsvRecord(record: string[] | Record<string, unknown>): GpFctOrderRawRow {
  const item: Record<string, unknown> = {};
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
  const scheduledAt = scheduledAtUtc;
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
