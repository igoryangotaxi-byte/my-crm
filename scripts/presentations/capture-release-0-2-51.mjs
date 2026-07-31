/**
 * Capture screenshots for 0.2.51 useful 3D Office (Attention / My Desk / Team).
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-51");
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

  console.log("01 3D Office — Attention dock…");
  await page.goto(`${BASE}/sales-operation/office`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  const graphics = page.getByRole("button", { name: /graphics/i }).first();
  if (await graphics.count()) {
    await graphics.click().catch(() => null);
    await page.waitForTimeout(300);
    const high = page.getByRole("button", { name: /^high$/i }).first();
    if (await high.count()) await high.click().catch(() => null);
    await page.waitForTimeout(600);
  }
  const attention = page.getByRole("button", { name: /^attention$/i }).first();
  if (await attention.count()) await attention.click().catch(() => null);
  await page.waitForTimeout(1200);
  await save(page, "01-attention-dock");

  console.log("02 My Desk…");
  const myDesk = page.getByRole("button", { name: /my desk/i }).first();
  if (await myDesk.count()) await myDesk.click().catch(() => null);
  await page.waitForTimeout(1500);
  await save(page, "02-my-desk");

  console.log("03 Team dock…");
  const team = page.getByRole("button", { name: /^team$/i }).first();
  if (await team.count()) await team.click().catch(() => null);
  await page.waitForTimeout(1500);
  // Click first manager chip in the team strip if present
  const managerChip = page
    .locator("button")
    .filter({ hasText: /.+/ })
    .nth(0);
  await save(page, "03-team-dock");

  console.log("04 Pipeline Wall…");
  const pipelineChip = page.getByRole("button", { name: /pipeline wall|pipeline/i }).first();
  if (await pipelineChip.count()) {
    await pipelineChip.click().catch(() => null);
    await page.waitForTimeout(2000);
  }
  await save(page, "04-pipeline-wall");

  console.log("05 Sales room + CRM managers…");
  const sales = page.getByRole("button", { name: /sales room|sales/i }).first();
  if (await sales.count()) {
    await sales.click().catch(() => null);
    await page.waitForTimeout(2000);
  }
  await save(page, "05-sales-managers");

  console.log("06 Ask Ops…");
  const ask = page.getByPlaceholder(/ask ops/i).first();
  if (await ask.count()) {
    await ask.fill("stuck deals");
    await page.waitForTimeout(400);
    const go = page.getByRole("button", { name: /^go$/i }).first();
    if (await go.count()) await go.click().catch(() => null);
    await page.waitForTimeout(1200);
  }
  await save(page, "06-ask-ops");

  console.log("07 Classic toggle on pipeline…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await save(page, "07-classic-toggle");

  await browser.close();
  console.log("Done.");
  void managerChip;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
