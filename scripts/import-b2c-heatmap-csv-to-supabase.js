#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const { createClient } = require("@supabase/supabase-js");

function getRequiredEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function parseWallDateToUtcIso(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = Number(m[6]);
  if (![y, mo, d, h, mi, sec].every(Number.isFinite)) return null;
  // Fast approximation: source data is Israel local wall-time.
  // For historical backfill, exact DST minute ambiguity is negligible for heatmap buckets.
  const utcMs = Date.UTC(y, mo - 1, d, h - 3, mi, sec);
  return new Date(utcMs).toISOString();
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: node scripts/import-b2c-heatmap-csv-to-supabase.js <absolute_csv_path>");
  }
  const csvPath = path.resolve(inputPath);
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true });

  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const batch = [];
  let inserted = 0;
  const chunkSize = 5000;
  for (const row of rows) {
    const lat = Number(row.source_lat);
    const lon = Number(row.source_lon);
    const tripTs = parseWallDateToUtcIso(row.trip_datetime);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !tripTs) continue;
    batch.push({
      trip_ts: tripTs,
      source_lat: lat,
      source_lon: lon,
      order_id: row.order_id ? String(row.order_id) : null,
    });
    if (batch.length >= chunkSize) {
      const { error } = await supabase.from("b2c_heatmap_trip_starts").insert(batch);
      if (error) throw new Error(error.message);
      inserted += batch.length;
      batch.length = 0;
      process.stdout.write(`Inserted ${inserted}\n`);
    }
  }
  if (batch.length > 0) {
    const { error } = await supabase.from("b2c_heatmap_trip_starts").insert(batch);
    if (error) throw new Error(error.message);
    inserted += batch.length;
  }
  process.stdout.write(`Done. Inserted rows: ${inserted}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

