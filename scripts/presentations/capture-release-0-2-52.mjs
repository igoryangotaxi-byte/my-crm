/**
 * Capture screenshots for 0.2.52 Route Bundles + HUB.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-52");
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
  page.setDefaultTimeout(40_000);

  console.log("01 HUB / Pre-Orders…");
  await page.goto(`${BASE}/sales-operation/pre-orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await save(page, "01-hub-preorders");

  console.log("02 Route Bundles workspace…");
  await page.goto(`${BASE}/sales-operation/route-bundles`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await save(page, "02-route-bundles-list");

  console.log("03 Select first bundle (map)…");
  const bundleCard = page.locator("aside button").filter({ hasText: /pre-orders|Unassigned|km empty/i }).first();
  if (await bundleCard.count()) {
    await bundleCard.click();
  } else {
    const fallback = page.getByRole("button", { name: /pre-orders|Unassigned/i }).first();
    if (await fallback.count()) await fallback.click().catch(() => null);
  }
  await page.waitForTimeout(6000);
  await save(page, "03-route-bundles-map");

  console.log("04 Open settings drawer…");
  const settingsBtn = page.getByRole("button", { name: /settings/i }).first();
  if (await settingsBtn.count()) {
    await settingsBtn.click().catch(() => null);
    await page.waitForTimeout(1200);
    await save(page, "04-route-bundles-settings");
    await page.keyboard.press("Escape").catch(() => null);
  } else {
    await page.goto(`${BASE}/sales-operation/route-bundles?settings=1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await save(page, "04-route-bundles-settings");
  }

  console.log("05 Orders in HUB…");
  await page.goto(`${BASE}/sales-operation/orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await save(page, "05-hub-orders");

  console.log("06 API Health Check…");
  await page.goto(`${BASE}/sales-operation/api-health-check`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await save(page, "06-api-health-check");

  console.log("07 Price Calculator (HUB neighbor)…");
  await page.goto(`${BASE}/sales-operation/price-calculator`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "07-price-calculator");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
