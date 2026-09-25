/**
 * Remove New driver_leads that duplicate a phone already in
 * registered / in_progress / rejected (sheet import created both
 * no_license→New and licensed→Registered for the same person).
 *
 * Usage:
 *   npx tsx scripts/dedupe-driver-leads-by-phone.ts
 *   npx tsx scripts/dedupe-driver-leads-by-phone.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { israelPhoneKey } from "../lib/call-center/phone";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../lib/supabase";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

type Row = {
  id: string;
  phone: string | null;
  status: string;
  full_name: string;
  custom_fields: Record<string, unknown> | null;
};

async function main() {
  const apply = process.argv.includes("--apply");
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (.env.local).");
  }
  const supabase = getSupabaseAdminClient();

  const all: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("driver_leads")
      .select("id,phone,status,full_name,custom_fields")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...(data as Row[]));
    from += 1000;
    if (data.length < 1000) break;
  }

  const byPhone = new Map<string, Row[]>();
  for (const row of all) {
    const key = israelPhoneKey(row.phone);
    if (!key) continue;
    const list = byPhone.get(key) ?? [];
    list.push(row);
    byPhone.set(key, list);
  }

  const toDelete: Row[] = [];
  for (const rows of byPhone.values()) {
    if (rows.length < 2) continue;
    const hasAdvanced = rows.some((r) => r.status !== "new");
    if (!hasAdvanced) continue;
    for (const row of rows) {
      if (row.status === "new") toDelete.push(row);
    }
  }

  console.log(
    apply ? "APPLY — deleting New duplicates" : "DRY RUN — no deletes",
  );
  console.log({
    phonesScanned: byPhone.size,
    newDuplicatesToRemove: toDelete.length,
    includes549130376: toDelete.some(
      (r) => israelPhoneKey(r.phone) === "549130376",
    ),
  });

  if (!apply) {
    console.log(
      "Sample:",
      toDelete.slice(0, 8).map((r) => ({
        id: r.id,
        phone: r.phone,
        name: r.full_name,
        tab: (r.custom_fields as { sheet_tab?: string } | null)?.sheet_tab,
      })),
    );
    return;
  }

  let deleted = 0;
  let errors = 0;
  for (const row of toDelete) {
    const { error } = await supabase.from("driver_leads").delete().eq("id", row.id);
    if (error) {
      errors++;
      console.error(`Failed ${row.id}:`, error.message);
    } else {
      deleted++;
    }
  }
  console.log("Done.", { deleted, errors });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
