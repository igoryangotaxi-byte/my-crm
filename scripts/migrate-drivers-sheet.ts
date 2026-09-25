/**
 * One-shot: migrate AppliTaxi Drivers Leads Google Sheet → driver_leads.
 *
 * Sources (public CSV):
 * - gid=178449912  עם רישיון למונית (Status mapping) — imported first
 * - gid=819928561  בלי רישיון מונית → rejected + "No license"
 *   (skipped if phone already exists on licensed tab)
 *
 * Mapping (licensed tab Status):
 * - Status === "Registered" → registered
 * - empty Status → new
 * - any other Status → rejected + rejected_substatus = Status
 *
 * Usage:
 *   npx tsx scripts/migrate-drivers-sheet.ts
 *   npx tsx scripts/migrate-drivers-sheet.ts --dry-run
 *
 * After a bad dual-tab import, also run:
 *   npx tsx scripts/dedupe-driver-leads-by-phone.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { israelPhoneKey } from "../lib/call-center/phone";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../lib/supabase";
import {
  createDriverLead,
  findDriverLeadBySheetRowKey,
} from "../lib/drivers-pipeline/repository";
import { NO_TAXI_LICENSE_SUBSTATUS } from "../lib/drivers-pipeline/taxi-license";
import { resolveDriverHubExpert } from "../lib/drivers-pipeline/hub-experts";
import type { CreateDriverLeadInput, DriverLeadStatus } from "../lib/drivers-pipeline/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const SHEET_ID = "1bpvCAqSXsfhbJxtXbsF8hfvWbVJWXFjdy7KnkllDRwc";
const LICENSED_GID = "178449912";
const NO_LICENSE_GID = "819928561";

const ACTOR = { userId: null as string | null, name: "Sheet import" };

type SheetRow = Record<string, string>;

function parseCsv(text: string): SheetRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => c.trim())) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj: SheetRow = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    return obj;
  });
}

async function fetchSheetCsv(gid: string): Promise<SheetRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet CSV fetch failed gid=${gid} HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

function pick(row: SheetRow, keys: string[]): string {
  for (const key of keys) {
    if (row[key]?.trim()) return row[key].trim();
  }
  // Case-insensitive fallback
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v?.trim()) return v.trim();
  }
  return "";
}

function mapLicensedStatus(statusRaw: string): {
  status: DriverLeadStatus;
  rejectedSubstatus: string | null;
} {
  const status = statusRaw.trim();
  if (!status) return { status: "new", rejectedSubstatus: null };
  if (status.toLowerCase() === "registered") {
    return { status: "registered", rejectedSubstatus: null };
  }
  return { status: "rejected", rejectedSubstatus: status };
}

function sheetRowKey(parts: {
  date: string;
  name: string;
  email: string;
  phone: string;
  tab: string;
}): string {
  return [parts.tab, parts.date, parts.phone, parts.email, parts.name]
    .map((p) => p.trim().toLowerCase())
    .join("|");
}

async function phoneAlreadyImported(
  phone: string | null,
  knownKeys: Set<string>,
): Promise<boolean> {
  const key = israelPhoneKey(phone);
  if (!key) return false;
  if (knownKeys.has(key)) return true;
  const supabase = getSupabaseAdminClient();
  // Match common Israel formats stored as raw sheet digits
  const variants = [key, `0${key}`, `972${key}`, `+972${key}`];
  const { data, error } = await supabase
    .from("driver_leads")
    .select("id,phone")
    .in("phone", variants)
    .limit(20);
  if (error) throw new Error(error.message);
  const hit = (data ?? []).some((row) => israelPhoneKey(row.phone as string) === key);
  if (hit) knownKeys.add(key);
  return hit;
}

async function importRows(
  rows: SheetRow[],
  options: {
    tab: string;
    taxiLicense: boolean | null;
    dryRun: boolean;
    /** Skip create when this phone already has any lead (no_license after licensed). */
    skipIfPhoneExists: boolean;
    knownPhoneKeys: Set<string>;
  },
): Promise<{ created: number; skipped: number; errors: number }> {
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const name = pick(row, ["Name", "name", "fullName"]);
    if (!name) {
      skipped++;
      continue;
    }
    const email = pick(row, ["Email", "email"]) || null;
    const phone = pick(row, ["Phone number", "Phone", "phone"]) || null;
    const date = pick(row, ["Date", "date"]);
    const comment = pick(row, ["Comment", "comment"]);
    const hubExpert = pick(row, ["Hub Expert", "Hub expert", "hub expert"]);
    const campaign = pick(row, ["campaign", "Campaign"]);
    const statusRaw = pick(row, ["Status", "status"]);

    const mapped =
      options.taxiLicense === false
        ? {
            status: "rejected" as const,
            rejectedSubstatus: NO_TAXI_LICENSE_SUBSTATUS,
          }
        : mapLicensedStatus(statusRaw);

    const key = sheetRowKey({
      date,
      name,
      email: email ?? "",
      phone: phone ?? "",
      tab: options.tab,
    });

    try {
      const existing = await findDriverLeadBySheetRowKey(key);
      if (existing) {
        skipped++;
        continue;
      }

      if (options.skipIfPhoneExists) {
        const dup = options.dryRun
          ? options.knownPhoneKeys.has(israelPhoneKey(phone))
          : await phoneAlreadyImported(phone, options.knownPhoneKeys);
        if (dup) {
          skipped++;
          continue;
        }
      }

      const hubResolved = await resolveDriverHubExpert(hubExpert);
      const hubName =
        hubResolved?.name ??
        (hubExpert && hubExpert.trim().toLowerCase() !== "unassigned"
          ? hubExpert.trim()
          : null);

      const input: CreateDriverLeadInput = {
        fullName: name,
        email,
        phone,
        status: mapped.status,
        rejectedSubstatus: mapped.rejectedSubstatus,
        source: "import",
        campaignName: campaign || null,
        assignedManagerUserId: hubResolved?.userId ?? null,
        assignedManagerName: hubName,
        generalNotes: comment || null,
        customFields: {
          sheet_row_key: key,
          sheet_tab: options.tab,
          sheet_date: date || null,
          taxi_license:
            options.taxiLicense === null ? null : options.taxiLicense ? "yes" : "no",
          import_status_raw: statusRaw || null,
        },
      };

      if (options.dryRun) {
        const phoneKey = israelPhoneKey(phone);
        if (phoneKey) options.knownPhoneKeys.add(phoneKey);
        created++;
        continue;
      }
      await createDriverLead(input, ACTOR);
      const phoneKey = israelPhoneKey(phone);
      if (phoneKey) options.knownPhoneKeys.add(phoneKey);
      created++;
    } catch (error) {
      errors++;
      console.error(`Failed row ${key}:`, error instanceof Error ? error.message : error);
    }
  }

  return { created, skipped, errors };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (.env.local).");
  }
  // Touch client early so misconfig fails fast
  getSupabaseAdminClient();

  console.log(dryRun ? "DRY RUN — no writes" : "Importing driver leads from Google Sheet…");

  const knownPhoneKeys = new Set<string>();

  const licensed = await fetchSheetCsv(LICENSED_GID);
  console.log(`Licensed tab rows: ${licensed.length}`);
  const licensedResult = await importRows(licensed, {
    tab: "licensed",
    taxiLicense: true,
    dryRun,
    skipIfPhoneExists: false,
    knownPhoneKeys,
  });
  console.log("Licensed:", licensedResult);

  const noLicense = await fetchSheetCsv(NO_LICENSE_GID);
  console.log(`No-license tab rows: ${noLicense.length}`);
  const noLicenseResult = await importRows(noLicense, {
    tab: "no_license",
    taxiLicense: false,
    dryRun,
    // Same phone often already Registered/Rejected on licensed tab — do not also create New.
    skipIfPhoneExists: true,
    knownPhoneKeys,
  });
  console.log("No-license:", noLicenseResult);

  console.log("Done.", {
    dryRun,
    created: licensedResult.created + noLicenseResult.created,
    skipped: licensedResult.skipped + noLicenseResult.skipped,
    errors: licensedResult.errors + noLicenseResult.errors,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
