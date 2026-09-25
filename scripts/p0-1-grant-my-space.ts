/**
 * P0-1: explicitly grant User / Team Lead `salesOperation` + `salesMySpace` in prod KV.
 *
 * Code defaults (types/auth.ts) already give User / Team Lead My Space only for *new*
 * empty role permission stores. This script repairs older KV snapshots that still store
 * salesOperation/salesMySpace as false for those roles.
 *
 * Dry-run by default — prints before/after for both roles. Writes only with `--apply`.
 * Single read-modify-write of `appli:auth:store:v1`; aborts if KV read fails.
 *
 * Usage:
 *   npx tsx scripts/p0-1-grant-my-space.ts
 *   npx tsx scripts/p0-1-grant-my-space.ts --apply
 *
 * Requires: KV_REST_API_URL, KV_REST_API_TOKEN (e.g. from `.env.local`).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { kv } from "@vercel/kv";
import {
  CURRENT_PERMISSIONS_VERSION,
  mergeRolePermissions,
} from "../lib/role-permissions";
import type { AppRole, AuthStoreData } from "../types/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const AUTH_STORE_KEY = "appli:auth:store:v1";
const TARGET_ROLES: AppRole[] = ["User", "Team Lead"];
const apply = process.argv.includes("--apply");

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

function snapshotRole(
  store: AuthStoreData,
  role: AppRole,
): { stored: Record<string, boolean | undefined>; effective: { salesOperation: boolean; salesMySpace: boolean } } {
  const storedVersion = store.storeMeta?.permissionsVersion ?? 0;
  const storedPartial = store.rolePermissions[role] ?? {};
  const merged = mergeRolePermissions(role, storedPartial, storedVersion);
  return {
    stored: {
      salesOperation: storedPartial.salesOperation,
      salesMySpace: storedPartial.salesMySpace,
    },
    effective: {
      salesOperation: Boolean(merged.salesOperation),
      salesMySpace: Boolean(merged.salesMySpace),
    },
  };
}

function printReport(label: string, store: AuthStoreData): void {
  console.log(`\n=== ${label} (permissionsVersion ${store.storeMeta?.permissionsVersion ?? 0}, code ${CURRENT_PERMISSIONS_VERSION}) ===`);
  for (const role of TARGET_ROLES) {
    const row = snapshotRole(store, role);
    console.log(
      JSON.stringify({
        role,
        storedKv: row.stored,
        effective: row.effective,
      }),
    );
  }
}

async function main(): Promise<void> {
  if (!kvConfigured()) {
    console.error("Missing KV_REST_API_URL / KV_REST_API_TOKEN.");
    process.exit(1);
  }

  let raw: AuthStoreData | null;
  try {
    raw = await kv.get<AuthStoreData>(AUTH_STORE_KEY);
  } catch (error) {
    console.error("KV read failed — aborting (no write).", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!raw?.rolePermissions) {
    console.error("KV snapshot missing or empty — aborting.");
    process.exit(1);
  }

  printReport("BEFORE", raw);

  const next: AuthStoreData = structuredClone(raw);
  for (const role of TARGET_ROLES) {
    next.rolePermissions[role] = {
      ...(next.rolePermissions[role] ?? {}),
      salesOperation: true,
      salesMySpace: true,
    };
  }

  printReport("AFTER (proposed)", next);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write KV.");
    return;
  }

  try {
    await kv.set(AUTH_STORE_KEY, next);
    console.log("\nKV updated.");
  } catch (error) {
    console.error("KV write failed.", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
