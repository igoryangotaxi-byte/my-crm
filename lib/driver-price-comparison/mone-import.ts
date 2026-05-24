import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type {
  MoneImportCommitResponse,
  MoneImportParseResponse,
} from "@/lib/driver-price-comparison/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PREVIEW_ROWS = 20;

const COLUMN_ALIASES: Record<string, string[]> = {
  order_id: ["order_id", "orderid", "order id", "id"],
  mone_price: ["mone_price", "mone price", "moneprice", "price", "taxitariff_price"],
  order_date: ["order_date", "order date", "date", "trip_date", "lcl_order_created_dttm"],
  actual_km: ["actual_km", "distance_km", "km", "distance", "actual km"],
  actual_minutes: ["actual_minutes", "time_min", "minutes", "duration", "actual minutes"],
  driver_price_with_vat: [
    "driver_price_with_vat",
    "driver price with vat",
    "driver_price",
    "driver price",
  ],
};

export type ParsedUpload = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectMapping(headers: string[]) {
  const normalized = headers.map((header) => ({
    original: header,
    key: normalizeHeader(header),
  }));
  const mapping: Record<string, string | null> = {
    order_id: null,
    mone_price: null,
    order_date: null,
    actual_km: null,
    actual_minutes: null,
    driver_price_with_vat: null,
  };

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = normalized.find((header) => aliases.includes(header.key));
    if (match) {
      mapping[field] = match.original;
    }
  }
  return mapping;
}

function toNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvBuffer(buffer: Buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];
  const headers = records.length ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

function parseXlsxBuffer(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [] as Record<string, string>[] };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? "")])),
  );
  return { headers, rows: normalizedRows };
}

export function parseUploadBuffer(fileName: string, buffer: Buffer): ParsedUpload {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("File is too large (max 15 MB).");
  }
  const lower = fileName.toLowerCase();
  const parsed =
    lower.endsWith(".xlsx") || lower.endsWith(".xls")
      ? parseXlsxBuffer(buffer)
      : parseCsvBuffer(buffer);
  return { fileName, headers: parsed.headers, rows: parsed.rows };
}

export function buildParseResponse(parsed: ParsedUpload): MoneImportParseResponse {
  const suggestedMapping = detectMapping(parsed.headers);
  const validationErrors: string[] = [];
  if (!suggestedMapping.mone_price) {
    validationErrors.push("Could not detect mone_price column.");
  }
  if (!suggestedMapping.order_id) {
    validationErrors.push(
      "order_id column not detected — fallback matching will be used when possible.",
    );
  }
  return {
    ok: true,
    fileName: parsed.fileName,
    headers: parsed.headers,
    suggestedMapping,
    previewRows: parsed.rows.slice(0, PREVIEW_ROWS),
    totalRows: parsed.rows.length,
    validationErrors,
  };
}

function readMappedValue(row: Record<string, string>, column: string | null | undefined) {
  if (!column) return "";
  return row[column] ?? "";
}

function normalizeOrderId(value: string) {
  return value.trim().toLowerCase();
}

function parseOrderDate(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type MatchOrderRow = {
  order_id: string;
  order_date: string;
  actual_km: number | null;
  actual_minutes: number | null;
  driver_price_with_vat: number | null;
  corp_client_id: string | null;
  client_price: number | null;
};

type GpFctOrderRow = {
  order_id: string;
  utc_order_created_dttm: string | null;
  lcl_order_due_dttm: string | null;
  corp_client_id: string | null;
  user_w_vat_cost: number | null;
  driver_cost: number | null;
  transporting_distance_fact_km: number | null;
  transporting_time_fact_mnt: number | null;
};

function mapGpRowToMatchOrder(row: GpFctOrderRow): MatchOrderRow | null {
  const orderDate = row.utc_order_created_dttm ?? row.lcl_order_due_dttm;
  if (!row.order_id || !orderDate) return null;
  return {
    order_id: row.order_id,
    order_date: orderDate,
    actual_km: row.transporting_distance_fact_km,
    actual_minutes: row.transporting_time_fact_mnt,
    driver_price_with_vat: row.driver_cost,
    corp_client_id: row.corp_client_id,
    client_price: row.user_w_vat_cost,
  };
}

async function loadGpOrdersForMatching() {
  const supabase = getSupabaseAdminClient();
  const rows: MatchOrderRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select(
        "order_id, utc_order_created_dttm, lcl_order_due_dttm, corp_client_id, user_w_vat_cost, driver_cost, transporting_distance_fact_km, transporting_time_fact_mnt",
      )
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.length) break;
    for (const row of data as GpFctOrderRow[]) {
      const mapped = mapGpRowToMatchOrder(row);
      if (mapped) rows.push(mapped);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function loadGpOrderIdSet() {
  const supabase = getSupabaseAdminClient();
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select("order_id")
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.length) break;
    for (const row of data) {
      ids.add(normalizeOrderId(String(row.order_id)));
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function ensureTaxiOrdersForMatched(
  ordersByNormalizedId: Map<string, MatchOrderRow>,
  matchedOrderIds: string[],
) {
  if (!matchedOrderIds.length) return;
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const upserts = matchedOrderIds
    .map((orderId) => {
      const row = ordersByNormalizedId.get(normalizeOrderId(orderId));
      if (!row) return null;
      return {
        order_id: row.order_id,
        order_date: row.order_date,
        corp_client_id: row.corp_client_id,
        client_price: row.client_price,
        driver_price_with_vat: row.driver_price_with_vat,
        actual_km: row.actual_km,
        actual_minutes: row.actual_minutes,
        updated_at: now,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const chunkSize = 500;
  for (let i = 0; i < upserts.length; i += chunkSize) {
    const chunk = upserts.slice(i, i + chunkSize);
    const { error } = await supabase.from("taxi_orders").upsert(chunk, { onConflict: "order_id" });
    if (error) {
      throw new Error(`Failed to upsert taxi_orders: ${error.message}`);
    }
  }
}

export async function estimateMoneImportMatches(
  rows: Record<string, string>[],
  columnMapping: Record<string, string | null>,
) {
  const gpOrderIds = await loadGpOrderIdSet();
  const orderIdColumn = columnMapping.order_id;
  let orderIdMatches = 0;
  if (orderIdColumn) {
    for (const row of rows) {
      const orderId = normalizeOrderId(readMappedValue(row, orderIdColumn));
      if (orderId && gpOrderIds.has(orderId)) {
        orderIdMatches += 1;
      }
    }
  }
  return {
    taxiOrdersCount: gpOrderIds.size,
    estimatedOrderIdMatches: orderIdMatches,
  };
}

function findFallbackMatch(
  gpOrders: MatchOrderRow[],
  input: {
    orderDate: string | null;
    actualKm: number | null;
    actualMinutes: number | null;
    driverPriceWithVat: number | null;
  },
) {
  if (!input.orderDate) return null;
  const targetDate = new Date(input.orderDate).getTime();
  const candidates = gpOrders.filter((order) => {
    const orderTime = new Date(order.order_date).getTime();
    if (Number.isNaN(orderTime)) return false;
    if (Math.abs(orderTime - targetDate) > 60_000) return false;
    if (input.actualKm !== null && order.actual_km !== null) {
      if (Math.abs(order.actual_km - input.actualKm) > 0.05) return false;
    }
    if (input.actualMinutes !== null && order.actual_minutes !== null) {
      if (Math.abs(order.actual_minutes - input.actualMinutes) > 1) return false;
    }
    if (input.driverPriceWithVat !== null && order.driver_price_with_vat !== null) {
      if (Math.abs(order.driver_price_with_vat - input.driverPriceWithVat) > 0.01) return false;
    }
    return true;
  });
  if (candidates.length === 1) return candidates[0]?.order_id ?? null;
  return null;
}

function tryMatchRow(
  ordersByNormalizedId: Map<string, MatchOrderRow>,
  gpOrders: MatchOrderRow[],
  input: {
    normalizedOrderId: string;
    rawOrderDate: string | null;
    rawActualKm: number | null;
    rawActualMinutes: number | null;
    rawDriverPrice: number | null;
  },
) {
  if (input.normalizedOrderId && ordersByNormalizedId.has(input.normalizedOrderId)) {
    return {
      matchedOrderId: ordersByNormalizedId.get(input.normalizedOrderId)?.order_id ?? null,
      matchStatus: "matched_by_order_id" as const,
    };
  }
  const fallback = findFallbackMatch(gpOrders, {
    orderDate: input.rawOrderDate,
    actualKm: input.rawActualKm,
    actualMinutes: input.rawActualMinutes,
    driverPriceWithVat: input.rawDriverPrice,
  });
  if (fallback) {
    return { matchedOrderId: fallback, matchStatus: "matched_by_fallback" as const };
  }
  return { matchedOrderId: null, matchStatus: "unmatched" as const };
}

async function insertMonePriceRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const supabase = getSupabaseAdminClient();
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("mone_prices").insert(chunk);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function rematchExistingUnmatched(
  ordersByNormalizedId: Map<string, MatchOrderRow>,
  gpOrders: MatchOrderRow[],
) {
  if (!gpOrders.length) return 0;
  const supabase = getSupabaseAdminClient();
  let rematched = 0;
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("mone_prices")
      .select(
        "id, order_id, mone_price, raw_order_date, raw_actual_km, raw_actual_minutes, raw_driver_price_with_vat",
      )
      .eq("match_status", "unmatched")
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.length) break;

    const newlyMatched: Array<{ id: string; matchedOrderId: string; matchStatus: string }> = [];
    for (const row of data) {
      const orderIdRaw = String(row.order_id ?? "").trim();
      const normalizedOrderId = orderIdRaw ? normalizeOrderId(orderIdRaw) : "";
      const match = tryMatchRow(ordersByNormalizedId, gpOrders, {
        normalizedOrderId,
        rawOrderDate: row.raw_order_date ? String(row.raw_order_date) : null,
        rawActualKm: row.raw_actual_km === null ? null : Number(row.raw_actual_km),
        rawActualMinutes: row.raw_actual_minutes === null ? null : Number(row.raw_actual_minutes),
        rawDriverPrice:
          row.raw_driver_price_with_vat === null ? null : Number(row.raw_driver_price_with_vat),
      });
      if (match.matchedOrderId) {
        newlyMatched.push({
          id: String(row.id),
          matchedOrderId: match.matchedOrderId,
          matchStatus: match.matchStatus,
        });
      }
    }

    if (newlyMatched.length) {
      const matchedOrderIds = newlyMatched.map((row) => row.matchedOrderId);
      await ensureTaxiOrdersForMatched(ordersByNormalizedId, matchedOrderIds);
      await supabase.from("mone_prices").delete().in("matched_order_id", matchedOrderIds);
      for (const row of newlyMatched) {
        const { error: updateError } = await supabase
          .from("mone_prices")
          .update({
            matched_order_id: row.matchedOrderId,
            match_status: row.matchStatus,
          })
          .eq("id", row.id);
        if (updateError) {
          throw new Error(updateError.message);
        }
      }
      rematched += newlyMatched.length;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rematched;
}

export async function commitMoneImport(input: {
  fileName: string;
  rows: Record<string, string>[];
  columnMapping: Record<string, string | null>;
  uploadedBy?: string | null;
  createdByUserId?: string | null;
}): Promise<MoneImportCommitResponse> {
  const supabase = getSupabaseAdminClient();
  const moneColumn = input.columnMapping.mone_price;
  if (!moneColumn) {
    throw new Error("mone_price column mapping is required.");
  }

  const gpOrders = await loadGpOrdersForMatching();
  const ordersByNormalizedId = new Map(
    gpOrders.map((row) => [normalizeOrderId(row.order_id), row]),
  );

  const { data: importRow, error: importError } = await supabase
    .from("mone_price_imports")
    .insert({
      file_name: input.fileName,
      uploaded_by: input.uploadedBy ?? null,
      status: "processing",
      total_rows: input.rows.length,
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select("id")
    .single();
  if (importError || !importRow) {
    throw new Error(importError?.message ?? "Failed to create import record.");
  }

  const importId = importRow.id as string;
  let invalidRows = 0;
  let duplicateRowsInFile = 0;
  const errors: Array<{ rowIndex: number; message: string }> = [];
  const matchedCandidates: Array<Record<string, unknown>> = [];
  const unmatchedByKey = new Map<string, Record<string, unknown>>();

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const monePrice = toNumber(readMappedValue(row, moneColumn));
    if (monePrice === null || monePrice <= 0) {
      invalidRows += 1;
      errors.push({ rowIndex: index + 1, message: "Invalid mone_price." });
      continue;
    }

    const orderIdRaw = readMappedValue(row, input.columnMapping.order_id).trim();
    const normalizedOrderId = orderIdRaw ? normalizeOrderId(orderIdRaw) : "";
    const rawOrderDate = parseOrderDate(
      readMappedValue(row, input.columnMapping.order_date),
    );
    const rawActualKm = toNumber(readMappedValue(row, input.columnMapping.actual_km));
    const rawActualMinutes = toNumber(readMappedValue(row, input.columnMapping.actual_minutes));
    const rawDriverPrice = toNumber(
      readMappedValue(row, input.columnMapping.driver_price_with_vat),
    );

    let matchedOrderId: string | null = null;
    let matchStatus = "unmatched";

    const match = tryMatchRow(ordersByNormalizedId, gpOrders, {
      normalizedOrderId,
      rawOrderDate,
      rawActualKm,
      rawActualMinutes,
      rawDriverPrice,
    });
    matchedOrderId = match.matchedOrderId;
    matchStatus = match.matchStatus;

    const record = {
      import_id: importId,
      order_id: orderIdRaw || null,
      mone_price: monePrice,
      raw_order_date: rawOrderDate,
      raw_actual_km: rawActualKm,
      raw_actual_minutes: rawActualMinutes,
      raw_driver_price_with_vat: rawDriverPrice,
      match_status: matchStatus,
      matched_order_id: matchedOrderId,
    };

    if (matchedOrderId) {
      matchedCandidates.push(record);
      continue;
    }

    const unmatchedKey = normalizedOrderId || `row-${index + 1}`;
    unmatchedByKey.set(unmatchedKey, record);
  }

  const dedupedMatched = new Map<string, Record<string, unknown>>();
  for (const row of matchedCandidates) {
    dedupedMatched.set(String(row.matched_order_id), row);
  }
  duplicateRowsInFile += matchedCandidates.length - dedupedMatched.size;

  const matchedRows = [...dedupedMatched.values()];
  const unmatchedRows = [...unmatchedByKey.values()];

  if (matchedRows.length) {
    const matchedOrderIds = [...dedupedMatched.keys()];
    await ensureTaxiOrdersForMatched(ordersByNormalizedId, matchedOrderIds);
    await supabase.from("mone_prices").delete().in("matched_order_id", matchedOrderIds);
    await insertMonePriceRows(matchedRows);
  }

  if (unmatchedRows.length) {
    await insertMonePriceRows(unmatchedRows);
  }

  const rematchedRows = await rematchExistingUnmatched(ordersByNormalizedId, gpOrders);

  const [{ count: matchedInImport }, { count: unmatchedInImport }] = await Promise.all([
    supabase
      .from("mone_prices")
      .select("*", { count: "exact", head: true })
      .eq("import_id", importId)
      .in("match_status", ["matched_by_order_id", "matched_by_fallback"]),
    supabase
      .from("mone_prices")
      .select("*", { count: "exact", head: true })
      .eq("import_id", importId)
      .eq("match_status", "unmatched"),
  ]);

  const matchedCount = matchedInImport ?? matchedRows.length;
  const unmatchedCount = unmatchedInImport ?? unmatchedRows.length;
  const savedRows = matchedCount + unmatchedCount;
  const importedRows = matchedCount;
  const skippedRows = unmatchedCount;
  const errorRows = invalidRows;

  const summary = {
    savedRows,
    matchedRows: matchedCount,
    unmatchedRows: unmatchedCount,
    invalidRows,
    duplicateRowsInFile,
    rematchedRows,
    gpOrdersInCrm: gpOrders.length,
  };

  await supabase
    .from("mone_price_imports")
    .update({
      status: "completed",
      imported_rows: importedRows,
      skipped_rows: skippedRows,
      error_rows: errorRows,
      error_summary: { stats: summary, errors: errors.slice(0, 200) },
    })
    .eq("id", importId);

  return {
    ok: true,
    importId,
    totalRows: input.rows.length,
    importedRows,
    skippedRows,
    errorRows,
    matchedRows: matchedCount,
    unmatchedRows: unmatchedCount,
    invalidRows,
    duplicateRowsInFile,
    rematchedRows,
    gpOrdersInCrm: gpOrders.length,
    errors: errors.slice(0, 100),
  };
}

export async function listMoneImports(limit = 20) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mone_price_imports")
    .select(
      "id, file_name, uploaded_at, status, total_rows, imported_rows, skipped_rows, error_rows",
    )
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    fileName: String(row.file_name),
    uploadedAt: String(row.uploaded_at),
    status: String(row.status),
    totalRows: Number(row.total_rows ?? 0),
    importedRows: Number(row.imported_rows ?? 0),
    skippedRows: Number(row.skipped_rows ?? 0),
    errorRows: Number(row.error_rows ?? 0),
  }));
}

export async function getMoneImportDetail(importId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: importRow, error } = await supabase
    .from("mone_price_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!importRow) return null;

  const { data: errorRows } = await supabase
    .from("mone_prices")
    .select("order_id, match_status, matched_order_id, mone_price")
    .eq("import_id", importId)
    .in("match_status", ["unmatched", "duplicate_skipped"])
    .limit(100);

  return { importRow, errorRows: errorRows ?? [] };
}
