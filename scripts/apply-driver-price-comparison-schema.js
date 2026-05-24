require("dotenv").config({ path: ".env.local", quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function resolveDatabaseUrl() {
  const direct = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (direct?.trim()) {
    return direct.trim();
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!password || !supabaseUrl) {
    throw new Error(
      "Set SUPABASE_DB_URL (preferred) or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL. " +
        "Find the connection string in Supabase Dashboard → Project Settings → Database.",
    );
  }

  const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  if (!match) {
    throw new Error(`Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`);
  }
  const projectRef = match[1];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function main() {
  const sqlPath = path.join(__dirname, "sql", "supabase_driver_price_comparison.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    process.stdout.write(
      "Applied driver price comparison schema: taxi_orders, mone_price_imports, mone_prices, driver_price_comparison_enriched view.\n",
    );
  } finally {
    await client.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
