/**
 * Capture screenshots for 0.2.48 Signed B2B handover release deck.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-48");
const BASE = process.env.SO_CAPTURE_BASE || "http://localhost:3000";
const USER_ID = process.env.SO_CAPTURE_USER_ID || "user-admin-1";

function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSessionToken(userId) {
  const secret =
    process.env.AUTH_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.KV_REST_API_TOKEN ||
    "dev-only-session-secret";
  const payload = base64UrlEncode(JSON.stringify({ userId, issuedAt: Date.now() }));
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

async function privacySoften(buffer) {
  return sharp(buffer)
    .blur(0.55)
    .modulate({ brightness: 1.015, saturation: 0.97 })
    .png()
    .toBuffer();
}

async function save(page, name) {
  const raw = await page.screenshot({ fullPage: false, type: "png" });
  const output = await privacySoften(raw);
  const file = join(OUT_DIR, `${name}.png`);
  writeFileSync(file, output);
  console.log(`  saved ${file}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  await context.addCookies([
    {
      name: "crm_session_v1",
      value: createSessionToken(USER_ID),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  console.log("Capturing Settings (Signed handover)…");
  await page.goto(`${BASE}/sales-operation/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const handover = page.getByText(/Signed handover/i).first();
  if (await handover.count()) {
    await handover.scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(400);
  }
  await save(page, "01-settings-handover");

  console.log("Capturing Pipeline…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "02-pipeline");

  console.log("Capturing Tracker…");
  await page.goto(`${BASE}/sales-operation/tracker`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await save(page, "03-tracker");

  console.log("Capturing Calendar…");
  await page.goto(`${BASE}/sales-operation/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await save(page, "04-calendar");

  console.log("Capturing My Space…");
  await page.goto(`${BASE}/sales-operation/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await save(page, "05-myspace");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
