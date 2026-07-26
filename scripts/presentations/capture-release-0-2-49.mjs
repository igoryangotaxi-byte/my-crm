/**
 * Capture screenshots for 0.2.49 Lead Discovery release deck.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-49");
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

async function clickTab(page, label) {
  const tab = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  if (await tab.count()) {
    await tab.click().catch(() => null);
    await page.waitForTimeout(800);
    return true;
  }
  const text = page.getByText(new RegExp(`^${label}$`, "i")).first();
  if (await text.count()) {
    await text.click().catch(() => null);
    await page.waitForTimeout(800);
    return true;
  }
  return false;
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

  console.log("Capturing Lead Discovery dashboard…");
  await page.goto(`${BASE}/sales-operation/lead-discovery`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await save(page, "01-dashboard");

  console.log("Capturing New campaign / wizard…");
  const newBtn = page.getByRole("button", { name: /new campaign|create campaign|новая/i }).first();
  if (await newBtn.count()) {
    await newBtn.click().catch(() => null);
    await page.waitForTimeout(1200);
  }
  await save(page, "02-wizard");

  // Close modal if open so tabs are reachable
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(400);

  console.log("Capturing Candidates / leads…");
  await clickTab(page, "Candidates|Leads|кандидаты|лиды");
  await save(page, "03-candidates");

  console.log("Capturing Automation…");
  await page.goto(`${BASE}/sales-operation/automation`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "04-automation");

  console.log("Capturing Advanced…");
  await page.goto(`${BASE}/sales-operation/lead-discovery`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await clickTab(page, "Advanced|расширен");
  await save(page, "05-advanced");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
