import { Readable } from "node:stream";
import { parse } from "csv-parse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  isCsvHeaderRow,
  mapCsvRecord,
  type GpFctOrderRawRow,
} from "@/lib/gp-trips-import/map-record";

const BATCH_SIZE = 500;
const QUERY_CHUNK = 200;

export type GpTripsImportResult = {
  ok: true;
  totalRead: number;
  uniqueInFile: number;
  duplicatesInFile: number;
  inserted: number;
  skippedExistingInDb: number;
  skippedEmptyOrderId: number;
  skippedHeaderRows: number;
};

export type GpTripsParseStats = {
  totalRead: number;
  uniqueInFile: number;
  duplicatesInFile: number;
  skippedEmptyOrderId: number;
  skippedHeaderRows: number;
  dedupedRows: GpFctOrderRawRow[];
};

async function insertBatch(supabase: SupabaseClient, rows: GpFctOrderRawRow[]) {
  const validRows = rows.filter((row) => row.order_id);
  if (!validRows.length) return 0;
  const { error } = await supabase.from("gp_fct_order_raw").insert(validRows);
  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
  return validRows.length;
}

async function upsertBatch(supabase: SupabaseClient, rows: GpFctOrderRawRow[]) {
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

async function findExistingOrderIds(supabase: SupabaseClient, orderIds: string[]) {
  const existing = new Set<string>();
  for (let i = 0; i < orderIds.length; i += QUERY_CHUNK) {
    const chunk = orderIds.slice(i, i + QUERY_CHUNK);
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select("order_id")
      .in("order_id", chunk);
    if (error) {
      throw new Error(`Supabase duplicate check failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (row?.order_id) existing.add(row.order_id);
    }
  }
  return existing;
}

export async function parseGpTripsCsvStream(
  source: Readable,
): Promise<GpTripsParseStats> {
  let totalRead = 0;
  let skippedEmptyOrderId = 0;
  let duplicatesInFile = 0;
  let skippedHeaderRows = 0;
  const latestByOrder = new Map<string, GpFctOrderRawRow>();

  const parser = source.pipe(
    parse({
      columns: false,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
    }),
  );

  for await (const record of parser) {
    if (
      !record ||
      (Array.isArray(record) && record.length === 0) ||
      (!Array.isArray(record) && Object.keys(record).length === 0)
    ) {
      continue;
    }
    if (Array.isArray(record) && isCsvHeaderRow(record)) {
      skippedHeaderRows += 1;
      continue;
    }
    totalRead += 1;
    const mapped = mapCsvRecord(record as string[] | Record<string, unknown>);
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
    duplicatesInFile += 1;
  }

  const dedupedRows = [...latestByOrder.values()];
  return {
    totalRead,
    uniqueInFile: dedupedRows.length,
    duplicatesInFile,
    skippedEmptyOrderId,
    skippedHeaderRows,
    dedupedRows,
  };
}

export async function writeGpTripsRows(
  supabase: SupabaseClient,
  dedupedRows: GpFctOrderRawRow[],
  options: { insertOnly?: boolean } = {},
): Promise<{ inserted: number; skippedExistingInDb: number }> {
  const insertOnly = options.insertOnly ?? true;
  let rowsToWrite = dedupedRows;
  let skippedExistingInDb = 0;

  if (insertOnly) {
    const orderIds = dedupedRows
      .map((row) => row.order_id)
      .filter((id): id is string => Boolean(id));
    const existing = await findExistingOrderIds(supabase, orderIds);
    rowsToWrite = dedupedRows.filter((row) => {
      if (row.order_id && existing.has(row.order_id)) {
        skippedExistingInDb += 1;
        return false;
      }
      return true;
    });
  }

  const writeBatch = insertOnly ? insertBatch : upsertBatch;
  let inserted = 0;
  let batch: GpFctOrderRawRow[] = [];
  for (const row of rowsToWrite) {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      inserted += await writeBatch(supabase, batch);
      batch = [];
    }
  }
  if (batch.length) {
    inserted += await writeBatch(supabase, batch);
  }

  return { inserted, skippedExistingInDb };
}

export async function importGpTripsFromCsvBuffer(
  buffer: Buffer,
  options: { insertOnly?: boolean } = {},
): Promise<GpTripsImportResult> {
  const supabase = getSupabaseAdminClient();
  const parseStats = await parseGpTripsCsvStream(Readable.from(buffer));
  const { inserted, skippedExistingInDb } = await writeGpTripsRows(
    supabase,
    parseStats.dedupedRows,
    options,
  );

  return {
    ok: true,
    totalRead: parseStats.totalRead,
    uniqueInFile: parseStats.uniqueInFile,
    duplicatesInFile: parseStats.duplicatesInFile,
    inserted,
    skippedExistingInDb,
    skippedEmptyOrderId: parseStats.skippedEmptyOrderId,
    skippedHeaderRows: parseStats.skippedHeaderRows,
  };
}

export { mapCsvRecord, isCsvHeaderRow, LEGACY_NO_HEADER_COLUMNS } from "@/lib/gp-trips-import/map-record";
