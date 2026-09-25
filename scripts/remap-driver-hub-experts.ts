/**
 * Remap sheet Hub Expert labels Itay/Adam onto CRM users.
 * Sharon, Sonya, and other names are left unchanged.
 *
 * Usage: npx tsx scripts/remap-driver-hub-experts.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { findUserByEmail } from "../lib/auth-store";
import { DRIVER_HUB_EXPERT_EMAIL_BY_ALIAS } from "../lib/drivers-pipeline/hub-experts";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const targets: { alias: string; email: string; userId: string; name: string }[] = [];
  for (const [alias, email] of Object.entries(DRIVER_HUB_EXPERT_EMAIL_BY_ALIAS)) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.error(`CRM user not found for ${alias} → ${email}`);
      process.exit(1);
    }
    targets.push({ alias, email, userId: user.id, name: user.name });
  }

  const sb = createClient(url, key);
  const summary: Record<string, number> = {};

  for (const target of targets) {
    const { data, error } = await sb
      .from("driver_leads")
      .select("id, assigned_manager_name, assigned_manager_user_id")
      .ilike("assigned_manager_name", target.alias)
      .is("assigned_manager_user_id", null);

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    const rows = data ?? [];
    summary[target.alias] = rows.length;
    console.log(
      `${dryRun ? "[dry-run] " : ""}${target.alias} → ${target.name} (${target.email}): ${rows.length} leads`,
    );

    if (dryRun || rows.length === 0) continue;

    const ids = rows.map((r) => r.id as string);
    // chunk updates
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error: updError } = await sb
        .from("driver_leads")
        .update({
          assigned_manager_user_id: target.userId,
          assigned_manager_name: target.name,
          updated_at: new Date().toISOString(),
        })
        .in("id", chunk);
      if (updError) {
        console.error(updError.message);
        process.exit(1);
      }
    }
  }

  console.log(JSON.stringify({ ok: true, dryRun, summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
