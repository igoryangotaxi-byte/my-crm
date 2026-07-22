import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAIN = "appli.taxi";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function isAllowedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function isClientPortalUser(user: {
  email: string;
  user_metadata?: Record<string, unknown> | null;
}): boolean {
  const email = String(user.email ?? "").trim().toLowerCase();
  const accountType = user.user_metadata?.crmAccountType;
  return accountType === "client" || email.endsWith("@client.local");
}

/**
 * Deletes internal CRM Auth users whose email is not @appli.taxi.
 * Client-portal accounts (@client.local / crmAccountType=client) are preserved.
 *
 * Usage:
 *   npx tsx scripts/purge-non-appli-taxi-users.ts
 *   npx tsx scripts/purge-non-appli-taxi-users.ts --apply
 */
async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authUsers: Array<{
    id: string;
    email: string;
    user_metadata?: Record<string, unknown> | null;
  }> = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    for (const user of data?.users ?? []) {
      authUsers.push({
        id: user.id,
        email: String(user.email ?? "").trim().toLowerCase(),
        user_metadata:
          user.user_metadata && typeof user.user_metadata === "object"
            ? (user.user_metadata as Record<string, unknown>)
            : null,
      });
    }
    if ((data?.users ?? []).length < 1000) break;
    page += 1;
  }

  const toDelete = authUsers.filter(
    (user) => user.email && !isAllowedEmail(user.email) && !isClientPortalUser(user),
  );
  const keptAppli = authUsers.filter((user) => isAllowedEmail(user.email));
  const keptClients = authUsers.filter((user) => isClientPortalUser(user));

  console.log(`Auth users: ${authUsers.length}`);
  console.log(`Keep @appli.taxi: ${keptAppli.length}`);
  console.log(`Keep client portal: ${keptClients.length}`);
  console.log(`Delete internal non-@appli.taxi: ${toDelete.length}`);
  for (const user of toDelete) {
    console.log(
      `  DELETE ${user.email} | ${String(user.user_metadata?.crmName ?? "")} | ${String(user.user_metadata?.crmPublicUserId ?? "")}`,
    );
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to delete.");
    return;
  }

  for (const user of toDelete) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error && !/not found|already|does not exist/i.test(error.message)) {
      throw new Error(`Failed to delete ${user.email}: ${error.message}`);
    }
    console.log(`Deleted ${user.email}`);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
