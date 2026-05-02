/**
 * Pushes every non-empty Yango API token from `.env.local` into the **single KV store**
 * `appli:yango:token-registry:v1` (same place Notes onboarding / register use — e.g. TEST CABINET).
 *
 * After this, `getTokenConfigs()` prefers registry over env (default), so localhost matches prod
 * as long as `KV_REST_*` points at the same KV.
 *
 * Usage:
 *   npx tsx scripts/sync-yango-env-tokens-to-kv.ts           # apply
 *   npx tsx scripts/sync-yango-env-tokens-to-kv.ts --dry-run # print only
 *
 * Requires in env (e.g. from `.env.local`): `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  loadYangoTokenRegistry,
  normalizeYangoTokenRegistryLabel,
  upsertYangoTokenRegistryEntry,
} from "../lib/yango-token-registry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
const dryRun = process.argv.includes("--dry-run");
const verbose = process.argv.includes("--verbose");

function readToken(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) return normalized;
  }
  return "";
}

type CabinetRow = {
  label: string;
  crmClientName: string;
  token: () => string;
};

/** Mirrors `getStaticTokenConfigs()` in `lib/yango-api.ts` (env → token string). */
const CABINETS: CabinetRow[] = [
  { label: "COFIX", crmClientName: "COFIX", token: () => readToken(process.env.YANGO_TOKEN_COFIX, process.env.YANGO_TOKEN_SAMELET) },
  { label: "SHUFERSAL", crmClientName: "SHUFERSAL", token: () => readToken(process.env.YANGO_TOKEN_SHUFERSAL) },
  {
    label: "TEST CABINET",
    crmClientName: "TEST CABINET",
    token: () => readToken(process.env.YANGO_TOKEN_TEST_CABINET, process.env.YANGO_TOKEN_APLI_TAXI_OZ),
  },
  { label: "SHANA10", crmClientName: "SHANA10", token: () => readToken(process.env.YANGO_TOKEN_SHANA10) },
  {
    label: "TELAVIVMUNICIPALITY",
    crmClientName: "TelAvivMunicipality",
    token: () => readToken(process.env.YANGO_TOKEN_TEL_AVIV_MUNICIPALITY),
  },
  { label: "YANGODELI", crmClientName: "YangoDeli", token: () => readToken(process.env.YANGO_TOKEN_YANGO_DELI) },
  { label: "SHLAV", crmClientName: "SHLAV", token: () => readToken(process.env.YANGO_TOKEN_SHLAV) },
  { label: "SAMLET_MOTORS", crmClientName: "סמלת מוטורס", token: () => readToken(process.env.YANGO_TOKEN_SAMLET_MOTORS) },
  { label: "HAMOSHAVA_20", crmClientName: 'המושבה 20 בע"מ', token: () => readToken(process.env.YANGO_TOKEN_HAMOSHAVA_20) },
  { label: "Star Taxi Point", crmClientName: "Star Taxi Point", token: () => readToken(process.env.YANGO_TOKEN_STAR_TAXI_POINT) },
  { label: "OPTICITY", crmClientName: "Opticity", token: () => readToken(process.env.YANGO_TOKEN_OPTICITY) },
  { label: "ZHAK", crmClientName: "ZHAK", token: () => readToken(process.env.YANGO_TOKEN_ZHAK) },
];

function cabinetByNormKey(): Map<string, CabinetRow> {
  const m = new Map<string, CabinetRow>();
  for (const row of CABINETS) {
    m.set(normalizeYangoTokenRegistryLabel(row.label), row);
  }
  return m;
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  dotenv.config({ path: envPath });

  if (
    !dryRun &&
    (!(process.env.KV_REST_API_URL ?? "").trim() || !(process.env.KV_REST_API_TOKEN ?? "").trim())
  ) {
    console.error("KV_REST_API_URL and KV_REST_API_TOKEN must be set (same as prod KV).");
    process.exit(1);
  }

  if (verbose && !dryRun) {
    const existing = await loadYangoTokenRegistry();
    for (const row of CABINETS) {
      const norm = normalizeYangoTokenRegistryLabel(row.label);
      const hit = existing.find((e) => normalizeYangoTokenRegistryLabel(e.label) === norm);
      const envTok = row.token();
      console.log(
        `[registry] ${row.label}: envLen=${envTok.length} kvLen=${(hit?.token ?? "").trim().length}`,
      );
    }
  }

  const byNorm = cabinetByNormKey();
  const normsUpserted = new Set<string>();
  let written = 0;
  let skipped = 0;
  for (const row of CABINETS) {
    const token = row.token();
    if (!token) {
      skipped += 1;
      console.log(`skip (no env token): ${row.label}`);
      continue;
    }
    normsUpserted.add(normalizeYangoTokenRegistryLabel(row.label));
    if (dryRun) {
      console.log(`dry-run would upsert: ${row.label} (${token.length} chars)`);
      written += 1;
      continue;
    }
    await upsertYangoTokenRegistryEntry({
      label: row.label,
      crmClientName: row.crmClientName,
      token,
    });
    console.log(`upserted registry: ${row.label}`);
    written += 1;
  }

  /** Any other `YANGO_TOKEN_*` in .env.local (same pattern as fleet sync scripts). */
  for (const [envKey, rawVal] of Object.entries(process.env)) {
    if (!envKey.startsWith("YANGO_TOKEN_")) continue;
    if (envKey === "YANGO_TOKEN_REGISTRY_PRECEDENCE") continue;
    if (envKey === "YANGO_TOKEN_LOCAL_PREFER_ENV") continue;
    const token = (rawVal ?? "").trim();
    if (!token) continue;
    const suffix = envKey.slice("YANGO_TOKEN_".length);
    if (!suffix) continue;
    const norm = normalizeYangoTokenRegistryLabel(suffix.replace(/_/g, " "));
    if (normsUpserted.has(norm)) continue;
    const cabinet = byNorm.get(norm);
    const label = cabinet?.label ?? (suffix.replace(/_/g, " ").trim() || suffix);
    const crmClientName = cabinet?.crmClientName ?? label;
    normsUpserted.add(norm);
    if (dryRun) {
      console.log(`dry-run would upsert (extra env): ${envKey} → ${label} (${token.length} chars)`);
      written += 1;
      continue;
    }
    await upsertYangoTokenRegistryEntry({ label, crmClientName, token });
    console.log(`upserted registry (extra env): ${envKey} → ${label}`);
    written += 1;
  }

  console.log(`\nDone. ${dryRun ? "Would write" : "Wrote"} ${written} entries, skipped ${skipped} (empty env).`);
  console.log(
    "KV registry `appli:yango:token-registry:v1` is the single runtime source when precedence is registry. On laptop, stale KV vs good .env.local: set YANGO_TOKEN_LOCAL_PREFER_ENV=true (next dev only) or run this script after filling YANGO_TOKEN_*.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
