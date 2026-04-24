require("dotenv").config({ path: ".env.local", quiet: true });

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { createClient } = require("@supabase/supabase-js");

const BATCH_SIZE = 500;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function normalize(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function upsertBatch(supabase, rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .from("gp_corp_client_map")
    .upsert(rows, { onConflict: "corp_client_id" });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  return rows.length;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error(
      "Usage: node scripts/import-corp-client-map-to-supabase.js <absolute_csv_path>",
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

  const parser = fs
    .createReadStream(filePath, { encoding: "utf8" })
    .pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

  let totalRead = 0;
  let totalUnique = 0;
  let totalUpserted = 0;
  let skippedRows = 0;
  let batch = [];
  const latestByCorpClientId = new Map();

  for await (const row of parser) {
    totalRead += 1;
    const corpClientId = normalize(row.corp_client_id ?? row.CORP_CLIENT_ID);
    const clientName = normalize(
      row["CRM Account Name"] ??
        row.crm_account_name ??
        row.client_name ??
        row.CLIENT_NAME,
    );
    if (!corpClientId || !clientName) {
      skippedRows += 1;
      continue;
    }
    latestByCorpClientId.set(corpClientId, {
      corp_client_id: corpClientId,
      client_name: clientName,
      source: "client_review_csv",
      updated_at: new Date().toISOString(),
    });
  }

  const dedupedRows = [...latestByCorpClientId.values()];
  totalUnique = dedupedRows.length;

  for (const row of dedupedRows) {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      totalUpserted += await upsertBatch(supabase, batch);
      batch = [];
    }
  }
  if (batch.length) {
    totalUpserted += await upsertBatch(supabase, batch);
  }

  process.stdout.write(
    `Client map import finished. Read: ${totalRead}, unique: ${totalUnique}, upserted: ${totalUpserted}, skipped: ${skippedRows}, file: ${filePath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
