/**
 * Fills empty values in .env.local from a backup file (step after vercel env pull).
 * Removes YANGO_TOKEN_REGISTRY_PRECEDENCE when set to env (prod parity default).
 * Usage: node scripts/merge-env-local-from-backup.mjs [.env.local.bak.YYYYMMDD]
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const { parse } = dotenv;

const root = path.join(import.meta.dirname, "..");
const target = path.join(root, ".env.local");
const backupArg = process.argv[2];
const backup =
  backupArg && fs.existsSync(path.resolve(root, backupArg))
    ? path.resolve(root, backupArg)
    : fs.existsSync(path.join(root, ".env.local.bak.20260501"))
      ? path.join(root, ".env.local.bak.20260501")
      : null;

if (!backup || !fs.existsSync(backup)) {
  console.error("Missing backup file (e.g. .env.local.bak.20260501)");
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.error("Missing .env.local");
  process.exit(1);
}

function loadEnv(p) {
  return parse(fs.readFileSync(p, "utf8"));
}

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === "";
}

function escapeVal(v) {
  const s = String(v ?? "");
  if (s.includes("\n")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (/[#\s'"=]/.test(s) || s === "") {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

const cur = loadEnv(target);
const bak = loadEnv(backup);
const keys = new Set([...Object.keys(cur), ...Object.keys(bak)]);
const merged = {};

for (const k of keys) {
  if (k === "YANGO_TOKEN_REGISTRY_PRECEDENCE" && String(cur[k] ?? bak[k] ?? "").trim().toLowerCase() === "env") {
    continue;
  }
  const c = cur[k];
  const b = bak[k];
  if (!isEmpty(c)) merged[k] = c;
  else if (!isEmpty(b)) merged[k] = b;
  else merged[k] = c ?? b ?? "";
}

const header = [
  "# Merged: empty keys filled from backup; YANGO_TOKEN_REGISTRY_PRECEDENCE=env omitted for prod parity.",
  `# Backup: ${path.basename(backup)}`,
  "",
];
const body = [...Object.keys(merged)].sort().map((k) => `${k}=${escapeVal(merged[k])}`);

fs.writeFileSync(target, `${header.join("\n")}${body.join("\n")}\n`, "utf8");
console.log(`Wrote ${target} (${body.length} keys)`);
