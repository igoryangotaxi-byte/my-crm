/**
 * Capture screenshots for 0.2.50 Appli Taxi CRM + 3D Office release deck.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-50");
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
  page.setDefaultTimeout(25_000);

  console.log("01 Pipeline (Appli Taxi CRM shell)…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  await save(page, "01-pipeline-shell");

  console.log("02 Communications in SO…");
  await page.goto(`${BASE}/sales-operation/communications`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "02-communications");

  console.log("03 Price Calculator in SO…");
  await page.goto(`${BASE}/sales-operation/price-calculator`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "03-price-calculator");

  console.log("04 Settings → Access…");
  await page.goto(`${BASE}/sales-operation/settings?section=access`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2200);
  await save(page, "04-settings-access");

  console.log("05 3D Office overview…");
  await page.goto(`${BASE}/sales-operation/office`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  // Prefer High graphics so agents walk in the shot
  const graphics = page.getByRole("button", { name: /graphics/i }).first();
  if (await graphics.count()) {
    await graphics.click().catch(() => null);
    await page.waitForTimeout(400);
    const high = page.getByRole("button", { name: /^high$/i }).first();
    if (await high.count()) await high.click().catch(() => null);
    await page.waitForTimeout(800);
  }
  await save(page, "05-office-overview");

  console.log("06 Pipeline room…");
  const pipelineChip = page.getByRole("button", { name: /pipeline/i }).first();
  if (await pipelineChip.count()) {
    await pipelineChip.click().catch(() => null);
    await page.waitForTimeout(2000);
  }
  await save(page, "06-office-pipeline");

  console.log("07 Agent workbench (Igor K / Lior)…");
  const igor = page.getByRole("button", { name: /^igor k$/i }).first();
  const lior = page.getByRole("button", { name: /^lior$/i }).first();
  if (await igor.count()) {
    await igor.click().catch(() => null);
  } else if (await lior.count()) {
    await lior.click().catch(() => null);
  }
  await page.waitForTimeout(1800);
  // Try opening a leads action in the workbench
  const myLeads = page.getByRole("button", { name: /my open leads|all open deals|new leads/i }).first();
  if (await myLeads.count()) {
    await myLeads.click().catch(() => null);
    await page.waitForTimeout(1200);
  }
  await save(page, "07-office-workbench");

  console.log("08 Classic/3D toggle context (header on pipeline)…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await save(page, "08-classic-toggle");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
