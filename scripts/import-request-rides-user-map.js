require("dotenv").config({ path: ".env.local", quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");

function normalizePhoneKey(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function pick(record, keys) {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = String(record[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function readExisting(mapPath) {
  if (!fs.existsSync(mapPath)) return { global: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return { global: {} };
    return parsed;
  } catch {
    return { global: {} };
  }
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error(
      "Usage: node scripts/import-request-rides-user-map.js <employees_csv_path> [scopeKey]",
    );
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }
  const scopeKey = (process.argv[3] || "global").trim();
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  const mapPath = path.join(process.cwd(), "data", "request-rides-user-map.json");
  const map = readExisting(mapPath);
  const scoped = { ...(map[scopeKey] ?? {}) };

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const phone = pick(row, ["Phone number", "phone", "phone_number", "mobile_phone", "phoneNumber"]);
    const userId = pick(row, ["user_id", "userId", "ID", "id"]);
    const key = normalizePhoneKey(phone);
    if (!key || !userId) {
      skipped += 1;
      continue;
    }
    scoped[key] = userId;
    imported += 1;
  }

  map[scopeKey] = scoped;
  fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Imported ${imported} mappings into scope '${scopeKey}'. Skipped ${skipped}. File: ${mapPath}\n`,
  );
}

main();
