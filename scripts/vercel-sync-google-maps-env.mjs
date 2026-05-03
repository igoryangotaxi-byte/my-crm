/**
 * Pushes GOOGLE_MAPS_API_KEY from .env.local into Vercel (production, preview/develop, development).
 * Run: node scripts/vercel-sync-google-maps-env.mjs
 * Auth: VERCEL_TOKEN or VERCEL_OIDC_TOKEN in .env.local (same as other vercel-sync-* scripts).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const envPath = path.join(ROOT, ".env.local");
const KEYS = ["GOOGLE_MAPS_API_KEY"];
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

function runVercelEnvAdd(key, target, value, previewBranch, childEnv) {
  const args =
    target === "preview"
      ? [vercelCli, "env", "add", key, target, previewBranch, "--value", value, "--yes", "--force"]
      : [vercelCli, "env", "add", key, target, "--value", value, "--yes", "--force"];
  execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: childEnv,
  });
}

if (!fs.existsSync(vercelCli)) {
  console.error("Install devDependencies (vercel CLI) or run: npm install");
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const vars = parseEnvLocal(fs.readFileSync(envPath, "utf8"));

for (const key of KEYS) {
  if (!vars[key]?.trim()) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}

const vercelToken = (vars.VERCEL_TOKEN ?? process.env.VERCEL_TOKEN ?? "").trim();
const vercelOidc = (vars.VERCEL_OIDC_TOKEN ?? process.env.VERCEL_OIDC_TOKEN ?? "").trim();
if (!vercelToken && !vercelOidc) {
  console.error(
    "Missing VERCEL_TOKEN or VERCEL_OIDC_TOKEN in .env.local or process.env (same as other vercel:sync-* scripts)",
  );
  process.exit(1);
}

const childEnv = { ...process.env, CI: "1" };
if (vercelToken) childEnv.VERCEL_TOKEN = vercelToken;
if (vercelOidc) childEnv.VERCEL_OIDC_TOKEN = vercelOidc;

const targets = [
  ["production", null],
  ["preview", PREVIEW_GIT_BRANCH],
  ["development", null],
];

for (const [target, previewBranch] of targets) {
  for (const key of KEYS) {
    const value = vars[key].trim();
    console.log(`Sync ${key} → ${target}${previewBranch ? ` (${previewBranch})` : ""}…`);
    runVercelEnvAdd(key, target, value, previewBranch, childEnv);
  }
}
console.log("Done.");
