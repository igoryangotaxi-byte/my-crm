import { config } from "dotenv";
import fs from "node:fs";

config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import {
  parseGpTripsCsvStream,
  writeGpTripsRows,
} from "../lib/gp-trips-import/index";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const insertOnly = args.includes("--insert-only");
  const filePath = args.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    throw new Error(
      "Usage: tsx scripts/import-b2b-csv-to-supabase.ts <absolute_csv_path> [--insert-only]",
    );
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file does not exist: ${filePath}`);
  }

  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const parseStats = await parseGpTripsCsvStream(
    fs.createReadStream(filePath, { encoding: "utf8" }),
  );

  if (insertOnly) {
    process.stdout.write(
      `Duplicate check vs DB: unique_in_file=${parseStats.uniqueInFile}, parsing done, writing...\n`,
    );
  }

  const { inserted, skippedExistingInDb } = await writeGpTripsRows(
    supabase,
    parseStats.dedupedRows,
    { insertOnly },
  );

  const actionLabel = insertOnly ? "inserted" : "upserted";
  process.stdout.write(
    `Import finished. Read: ${parseStats.totalRead}, unique: ${parseStats.uniqueInFile}, ${actionLabel}: ${inserted}, duplicates_collapsed: ${parseStats.duplicatesInFile}, skipped_existing_in_db: ${skippedExistingInDb}, skipped_empty_order_id: ${parseStats.skippedEmptyOrderId}, skipped_headers: ${parseStats.skippedHeaderRows}, mode: ${insertOnly ? "insert_only" : "upsert"}, source_time_mode: as_is_local, file: ${filePath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
