require("dotenv").config({ path: ".env.local", quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

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
  const sqlFiles = [
    "supabase_sales_operation.sql",
    "supabase_sales_operation_wordpress_source.sql",
    "supabase_sales_operation_proposal_sent_status.sql",
    "supabase_b2b_client_managers.sql",
    "supabase_auth_roles_account_sales_managers.sql",
    "supabase_sales_automation.sql",
    "supabase_list_active_corp_clients.sql",
    "supabase_sales_negotiation_status.sql",
    "supabase_sales_pipeline_config.sql",
    "supabase_sales_contacts.sql",
    "supabase_sales_tasks.sql",
    "supabase_sales_activities.sql",
    "supabase_sales_files.sql",
    "supabase_sales_notifications.sql",
    "supabase_sales_data_quality.sql",
    "supabase_sales_email.sql",
    "supabase_sales_kpi_targets.sql",
    "supabase_sales_personal_space.sql",
    "supabase_sales_task_hub.sql",
    "supabase_sales_stage_gates.sql",
    "supabase_feedback_requests.sql",
  ];
  const client = new Client({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    for (const file of sqlFiles) {
      const sqlPath = path.join(__dirname, "sql", file);
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, "utf8");
      await client.query(sql);
      process.stdout.write(`Applied ${file}\n`);
    }
  } finally {
    await client.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
