/**
 * Delete all sales_leads in status signed or rejected.
 * Also removes linked sales_clients (FK is ON DELETE RESTRICT).
 *
 * Usage:
 *   node scripts/delete-sales-leads-signed-rejected.js          # dry-run counts
 *   node scripts/delete-sales-leads-signed-rejected.js --confirm # actually delete
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
require("dotenv").config({ path: ".env.local", quiet: true });

const { createClient } = require("@supabase/supabase-js");

const STATUSES = ["signed", "rejected"];

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.local (or run npm run env:pull:production).`);
  }
  return value;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: leads, error: listError } = await supabase
    .from("sales_leads")
    .select("id, status, full_name, company_name")
    .in("status", STATUSES);

  if (listError) throw new Error(listError.message);

  const rows = leads ?? [];
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  process.stdout.write(
    `Found ${rows.length} lead(s): signed=${byStatus.signed}, rejected=${byStatus.rejected}\n`,
  );

  if (rows.length === 0) {
    process.stdout.write("Nothing to delete.\n");
    return;
  }

  if (!confirm) {
    process.stdout.write("Dry-run only. Re-run with --confirm to delete.\n");
    for (const row of rows.slice(0, 20)) {
      process.stdout.write(`  - [${row.status}] ${row.full_name}${row.company_name ? ` (${row.company_name})` : ""}\n`);
    }
    if (rows.length > 20) process.stdout.write(`  … and ${rows.length - 20} more\n`);
    return;
  }

  const leadIds = rows.map((r) => r.id);

  const { data: clients, error: clientsListError } = await supabase
    .from("sales_clients")
    .select("id")
    .in("lead_id", leadIds);
  if (clientsListError) throw new Error(clientsListError.message);

  const clientIds = (clients ?? []).map((c) => c.id);
  if (clientIds.length > 0) {
    const { error: deleteClientsError } = await supabase
      .from("sales_clients")
      .delete()
      .in("id", clientIds);
    if (deleteClientsError) throw new Error(deleteClientsError.message);
    process.stdout.write(`Deleted ${clientIds.length} sales_client(s).\n`);
  } else {
    process.stdout.write("No linked sales_clients.\n");
  }

  const { error: deleteLeadsError } = await supabase
    .from("sales_leads")
    .delete()
    .in("id", leadIds);
  if (deleteLeadsError) throw new Error(deleteLeadsError.message);

  process.stdout.write(`Deleted ${leadIds.length} sales_lead(s) (signed + rejected).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
