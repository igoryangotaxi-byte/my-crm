/**
 * Reads auth store from KV (needs KV_REST_* + loaded Yango tokens in env),
 * discovers default cost center per tenant via Yango API (same logic as onboarding),
 * writes tenant.defaultCostCenterId and backfills empty client user costCenterId.
 *
 * Usage (from repo root, after `npm run env:pull:production` or full .env.local):
 *   npx tsx scripts/sync-tenant-cost-centers-from-yango.ts
 *   npx tsx scripts/sync-tenant-cost-centers-from-yango.ts --dry-run
 *   npx tsx scripts/sync-tenant-cost-centers-from-yango.ts --tenant-id=tenant-xxx
 *
 * Manual overrides when Yango returns no centers (prepare JSON):
 *   { "tenant-uuid-here": "cost-center-uuid-from-yango-admin", "<apiClientId>": "cc-uuid" }
 *   npx tsx scripts/sync-tenant-cost-centers-from-yango.ts --overrides=./cc-overrides.json
 */
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";

config({ path: ".env.local" });
config({ path: ".env" });

import { loadAuthStore, saveAuthStore } from "../lib/auth-store";
import { discoverYangoTenantDefaultCostCenterId } from "../lib/tenant-yango-bootstrap";
import { listYangoClientUsers, listYangoCostCenters } from "../lib/yango-api";
import type { AuthStoreData } from "../types/auth";

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  let tenantId: string | null = null;
  let overridesPath: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--tenant-id=")) tenantId = arg.slice("--tenant-id=".length).trim() || null;
    if (arg.startsWith("--overrides=")) overridesPath = arg.slice("--overrides=".length).trim() || null;
  }
  return { dryRun, tenantId, overridesPath };
}

function loadOverrides(path: string | null): Record<string, string> {
  if (!path || !existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k.trim()] = v.trim();
    }
    return out;
  } catch {
    console.error("Failed to read overrides file:", path);
    process.exit(1);
  }
}

async function main() {
  const { dryRun, tenantId, overridesPath } = parseArgs();
  const overrides = loadOverrides(overridesPath);

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN — pull production env first.");
    process.exit(1);
  }

  const store = await loadAuthStore();
  const tenants = (store.tenantAccounts ?? []).filter((t) => t.enabled !== false);
  const targets = tenantId ? tenants.filter((t) => t.id === tenantId) : tenants;

  if (targets.length === 0) {
    console.error("No tenants to process.");
    process.exit(1);
  }

  let nextStore: AuthStoreData = store;
  let changed = false;

  for (const tenant of targets) {
    console.log("\n--- Tenant:", tenant.name, "| id:", tenant.id);
    console.log("    tokenLabel:", tenant.tokenLabel, "| apiClientId:", tenant.apiClientId);
    console.log("    KV defaultCostCenterId:", tenant.defaultCostCenterId ?? "(empty)");

    let yangoUsers: Awaited<ReturnType<typeof listYangoClientUsers>> = [];
    let centersFromApi: Awaited<ReturnType<typeof listYangoCostCenters>> = [];
    try {
      [yangoUsers, centersFromApi] = await Promise.all([
        listYangoClientUsers({
          tokenLabel: tenant.tokenLabel,
          clientId: tenant.apiClientId,
          limit: 1200,
        }),
        listYangoCostCenters({ tokenLabel: tenant.tokenLabel, clientId: tenant.apiClientId }),
      ]);
    } catch (e) {
      console.warn("    Yango fetch error:", e instanceof Error ? e.message : e);
    }

    console.log("    API cost_centers count:", centersFromApi.length);
    if (centersFromApi.length > 0) {
      console.log(
        "    API cost_centers ids:",
        centersFromApi.map((c) => c.id).join(", "),
      );
    }
    console.log("    Yango directory users:", yangoUsers.length);

    let discovered = await discoverYangoTenantDefaultCostCenterId({
      tokenLabel: tenant.tokenLabel,
      apiClientId: tenant.apiClientId,
      yangoUsers,
      prefetchedCostCenters: centersFromApi,
    });

    const fromOverride =
      overrides[tenant.id]?.trim() ||
      overrides[tenant.apiClientId]?.trim() ||
      overrides[tenant.corpClientId]?.trim() ||
      "";

    if (fromOverride) {
      console.log("    Using manual override:", fromOverride);
      discovered = fromOverride;
    }

    if (!discovered) {
      console.warn(
        "    RESULT: no cost center — configure centers in Yango for this park client or add --overrides.",
      );
      continue;
    }

    console.log("    RESULT default cost center id:", discovered);

    const prevDefault = (tenant.defaultCostCenterId ?? "").trim();
    if (prevDefault === discovered && !fromOverride) {
      const needsUserPatch = nextStore.users.some(
        (u) =>
          u.accountType === "client" &&
          u.tenantId === tenant.id &&
          !(u.costCenterId ?? "").trim(),
      );
      if (!needsUserPatch) {
        console.log("    No KV changes (already set, users have CC).");
        continue;
      }
    }

    changed = true;
    nextStore = {
      ...nextStore,
      tenantAccounts: (nextStore.tenantAccounts ?? []).map((row) =>
        row.id === tenant.id ? { ...row, defaultCostCenterId: discovered } : row,
      ),
      users: nextStore.users.map((user) => {
        if (
          user.accountType !== "client" ||
          user.tenantId !== tenant.id ||
          user.tokenLabel !== tenant.tokenLabel ||
          user.apiClientId !== tenant.apiClientId
        ) {
          return user;
        }
        if ((user.costCenterId ?? "").trim()) return user;
        return { ...user, costCenterId: discovered };
      }),
    };
    const patchedUsers = nextStore.users.filter(
      (u) =>
        u.tenantId === tenant.id &&
        u.accountType === "client" &&
        (u.costCenterId ?? "").trim() === discovered,
    ).length;
    console.log("    Will set tenant default + backfill users missing CC (dry-run:", dryRun, ")");
    console.log("    Users in tenant with CC after patch (approx):", patchedUsers);
  }

  if (changed && !dryRun) {
    await saveAuthStore(nextStore);
    console.log("\nDone. Auth store saved to KV.");
  } else if (changed && dryRun) {
    console.log("\nDry-run: no writes. Remove --dry-run to save.");
  } else {
    console.log("\nNo changes.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
