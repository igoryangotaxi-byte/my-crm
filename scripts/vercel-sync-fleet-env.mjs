/**
 * Pushes Fleet env vars from .env.local into Vercel (production, preview, development).
 * Run from repo root: node scripts/vercel-sync-fleet-env.mjs
 * Requires: npx vercel login, linked project (.vercel/project.json)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const envPath = path.join(ROOT, ".env.local");
const KEYS = ["FLEET_API_BASE_URL", "FLEET_API_KEY", "FLEET_CLIENT_ID", "FLEET_PARK_ID"];
/** Preview envs in this project are scoped to the `develop` branch (see `vercel env ls`). */
const PREVIEW_GIT_BRANCH = process.env.VERCEL_PREVIEW_GIT_BRANCH || "develop";

function parseEnvLocal(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const vercelCli = path.join(ROOT, "node_modules", "vercel", "dist", "vc.js");

function runVercelEnvAdd(key, target, value, previewBranch) {
  const args =
    target === "preview"
      ? [vercelCli, "env", "add", key, target, previewBranch, "--value", value, "--yes", "--force"]
      : [vercelCli, "env", "add", key, target, "--value", value, "--yes", "--force"];
  const out = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  process.stdout.write(out);
}

if (!fs.existsSync(vercelCli)) {
  console.error("Install devDependencies (vercel CLI) or run: npm install");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const vars = parseEnvLocal(raw);

for (const key of KEYS) {
  if (!vars[key]) {
    console.error(`Missing ${key} in .env.local — skip`);
    process.exitCode = 1;
    continue;
  }
}

const targets = [
  ["production", null],
  ["preview", PREVIEW_GIT_BRANCH],
  ["development", null],
];
for (const [target, previewBranch] of targets) {
  for (const key of KEYS) {
    const value = vars[key];
    if (!value) continue;
    console.log(`Sync ${key} → ${target}${previewBranch ? ` (${previewBranch})` : ""}…`);
    runVercelEnvAdd(key, target, value, previewBranch);
  }
}
console.log("Done.");
