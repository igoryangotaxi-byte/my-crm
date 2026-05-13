import "dotenv/config";
import { kv } from "@vercel/kv";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { saveAuthUsersToSupabaseAuthFallback } from "@/lib/supabase-auth-store";
import type { AuthStoreData } from "@/types/auth";

const AUTH_STORE_KEY = "appli:auth:store:v1";

function requireKvConfig() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    throw new Error("KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.");
  }
}

async function loadKvStore(): Promise<AuthStoreData> {
  requireKvConfig();
  const raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
  if (!raw) {
    throw new Error(`KV key ${AUTH_STORE_KEY} is empty or missing.`);
  }
  return raw;
}

async function listAllAuthEmails() {
  const supabase = getSupabaseAdminClient();
  const emails = new Set<string>();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list Supabase auth users: ${error.message}`);
    const batch = (data?.users ?? [])
      .map((user) => String(user.email ?? "").trim().toLowerCase())
      .filter(Boolean);
    for (const email of batch) {
      emails.add(email);
    }
    if (batch.length < 1000) break;
    page += 1;
  }
  return emails;
}

async function main() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const kvStore = await loadKvStore();
  await saveAuthUsersToSupabaseAuthFallback(kvStore);

  const authEmails = await listAllAuthEmails();
  const expectedEmails = (kvStore.users ?? [])
    .map((user) => user.email.trim().toLowerCase())
    .filter(Boolean);
  const missingEmails = expectedEmails.filter((email) => !authEmails.has(email));
  if (missingEmails.length > 0) {
    throw new Error(
      `Auth-only migration verification failed. Missing ${missingEmails.length} email(s): ${missingEmails.slice(0, 10).join(", ")}`,
    );
  }

  console.log("KV auth users migrated to Supabase Auth metadata successfully.");
  console.log(
    JSON.stringify(
      {
        usersTotal: expectedEmails.length,
        internalUsers: (kvStore.users ?? []).filter((user) => (user.accountType ?? "internal") !== "client").length,
        clientUsers: (kvStore.users ?? []).filter((user) => user.accountType === "client").length,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
