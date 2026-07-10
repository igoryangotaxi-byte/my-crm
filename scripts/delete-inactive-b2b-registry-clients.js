/**
 * Delete gp_corp_client_map rows with 0 successful trips since 2026-01-01
 * that are not linked from sales_clients.
 *
 * Usage:
 *   node scripts/delete-inactive-b2b-registry-clients.js          # dry-run
 *   node scripts/delete-inactive-b2b-registry-clients.js --confirm
 */
require("dotenv").config({ path: ".env.local", quiet: true });

const { createClient } = require("@supabase/supabase-js");

const ACTIVE_SINCE = "2026-01-01T00:00:00.000Z";
const PAGE_SIZE = 1000;

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.local.`);
  }
  return value;
}

function normalizeCorpClientId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

async function listActiveCorpIds(supabase) {
  const ids = new Set();
  const rpc = await supabase.rpc("list_active_corp_client_ids_since", {
    since_ts: ACTIVE_SINCE,
  });
  if (!rpc.error && Array.isArray(rpc.data)) {
    for (const row of rpc.data) {
      const raw =
        typeof row === "string"
          ? row
          : row && typeof row === "object"
            ? row.corp_client_id
            : "";
      const id = normalizeCorpClientId(raw);
      if (id) ids.add(id);
    }
    return ids;
  }
  if (rpc.error) {
    process.stdout.write(`RPC unavailable (${rpc.error.message}), scanning rows…\n`);
  }
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select("corp_client_id")
      .not("corp_client_id", "is", null)
      .eq("success_order_flg", true)
      .gte("lcl_order_due_dttm", ACTIVE_SINCE)
      .order("corp_client_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const id = normalizeCorpClientId(row.corp_client_id);
      if (id) ids.add(id);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return ids;
}

async function listRegistry(supabase) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("gp_corp_client_map")
      .select("corp_client_id,client_name")
      .order("corp_client_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listLinkedCorpIds(supabase) {
  const ids = new Set();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sales_clients")
      .select("corp_client_id")
      .not("corp_client_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const id = normalizeCorpClientId(row.corp_client_id);
      if (id) ids.add(id);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return ids;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  process.stdout.write("Loading active corp clients (success trips since 2026-01-01)…\n");
  const activeIds = await listActiveCorpIds(supabase);
  process.stdout.write(`Active corp clients: ${activeIds.size}\n`);

  const [registry, linkedIds] = await Promise.all([
    listRegistry(supabase),
    listLinkedCorpIds(supabase),
  ]);
  process.stdout.write(`Registry rows: ${registry.length}; linked from sales_clients: ${linkedIds.size}\n`);

  const toDelete = registry.filter((row) => {
    const id = normalizeCorpClientId(row.corp_client_id);
    if (!id) return false;
    if (activeIds.has(id)) return false;
    if (linkedIds.has(id)) return false;
    return true;
  });

  process.stdout.write(`Candidates to delete: ${toDelete.length}\n`);
  for (const row of toDelete.slice(0, 30)) {
    process.stdout.write(`  - ${row.corp_client_id} (${row.client_name})\n`);
  }
  if (toDelete.length > 30) {
    process.stdout.write(`  … and ${toDelete.length - 30} more\n`);
  }

  if (!confirm) {
    process.stdout.write("Dry-run only. Re-run with --confirm to delete.\n");
    return;
  }

  let deleted = 0;
  const chunkSize = 100;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize).map((row) => row.corp_client_id);
    const { error, count } = await supabase
      .from("gp_corp_client_map")
      .delete({ count: "exact" })
      .in("corp_client_id", chunk);
    if (error) throw new Error(error.message);
    deleted += count ?? chunk.length;
  }

  process.stdout.write(`Deleted ${deleted} gp_corp_client_map row(s).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
