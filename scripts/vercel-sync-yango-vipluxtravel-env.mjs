/**
 * Pushes YANGO_TOKEN_VIP_LUX_TRAVEL from .env.local into Vercel (production, preview, development).
 * Run: npm run vercel:sync-yango-vipluxtravel-env
 * Auth: VERCEL_TOKEN or VERCEL_OIDC_TOKEN in .env.local (same as other Yango sync scripts).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const envPath = path.join(ROOT, ".env.local");
const KEY = "YANGO_TOKEN_VIP_LUX_TRAVEL";
const PREVIEW_GIT_BRANCH = process.env.VERCEL_PREVIEW_GIT_BRANCH || "develop";

function parseEnvLocal(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[k] = val;
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
const value = vars[KEY]?.trim();
if (!value) {
  console.error(`Missing ${KEY} in .env.local`);
  process.exit(1);
}

const vercelToken = (vars.VERCEL_TOKEN ?? process.env.VERCEL_TOKEN ?? "").trim();
const vercelOidc = (vars.VERCEL_OIDC_TOKEN ?? process.env.VERCEL_OIDC_TOKEN ?? "").trim();
if (!vercelToken && !vercelOidc) {
  console.error(
    "Missing VERCEL_TOKEN or VERCEL_OIDC_TOKEN in .env.local or process.env (как у `vercel link` / fleet sync)",
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
  console.log(`Sync ${KEY} → ${target}${previewBranch ? ` (${previewBranch})` : ""}…`);
  runVercelEnvAdd(KEY, target, value, previewBranch, childEnv);
}
console.log("Done.");
