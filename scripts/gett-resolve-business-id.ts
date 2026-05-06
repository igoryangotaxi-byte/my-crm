/**
 * Loads `.env.local`, calls Gett OAuth, prints resolved Business API `businessId` (same logic as the app).
 * Writes `.env.gett-business-id-result.json` (gitignored via `.env*`) with the last run outcome.
 *
 * Usage: npx tsx scripts/gett-resolve-business-id.ts
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";

import { fetchGettBusinessIdDiagnostics } from "../lib/gett-api";

config({ path: ".env.local" });

const OUT = path.join(process.cwd(), ".env.gett-business-id-result.json");

async function main() {
  try {
    const row = await fetchGettBusinessIdDiagnostics();
    const payload = {
      resolvedAt: new Date().toISOString(),
      ok: true as const,
      diagnostics: row,
      error: null as null,
    };
    await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(row, null, 2));
    console.log(`\nWritten: ${OUT}`);
    if (row.flavor === "business" && row.businessApiBusinessId) {
      console.log("\nUse as GETT_BUSINESS_ID or ?businessId=", row.businessApiBusinessId);
    }
    if (row.flavor !== "business") {
      console.log("\nDemand Partner flavor: use partner_id for private APIs →", row.partnerId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const payload = {
      resolvedAt: new Date().toISOString(),
      ok: false as const,
      diagnostics: null as null,
      error: message,
    };
    await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.error(message);
    console.error(`\nWritten: ${OUT}`);
    process.exit(1);
  }
}

main();
