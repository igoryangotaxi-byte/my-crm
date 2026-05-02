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
import { upsertYangoTokenRegistryEntry } from "../lib/yango-token-registry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
const dryRun = process.argv.includes("--dry-run");

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

  let written = 0;
  let skipped = 0;
  for (const row of CABINETS) {
    const token = row.token();
    if (!token) {
      skipped += 1;
      console.log(`skip (no env token): ${row.label}`);
      continue;
    }
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
  console.log(`\nDone. ${dryRun ? "Would write" : "Wrote"} ${written} entries, skipped ${skipped} (empty env).`);
  console.log(
    "Registry is the single runtime source when KV is configured; keep KV_REST_* in .env.local. Optional: trim duplicate YANGO_TOKEN_* from env after verifying Notes diagnostics.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
