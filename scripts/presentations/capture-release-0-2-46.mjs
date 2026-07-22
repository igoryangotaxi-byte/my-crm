/**
 * Capture screenshots for 0.2.46 release deck:
 * B2B profile, Calendar, My Space sidebar.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-46");
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

  console.log("Capturing My Space…");
  await page.goto(`${BASE}/sales-operation/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await save(page, "01-myspace-tasks");

  console.log("Capturing Calendar…");
  await page.goto(`${BASE}/sales-operation/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await save(page, "02-calendar");

  // Try opening first event chip if present
  const eventChip = page.locator("button").filter({ hasText: /.+/ }).locator("xpath=ancestor::div[contains(@class,'grid-cols-7')]/following::button[1]").first();
  const anyEvent = page.locator("div.grid.grid-cols-7 button").first();
  if (await anyEvent.count()) {
    await anyEvent.click().catch(() => null);
    await page.waitForTimeout(800);
    await save(page, "03-calendar-event-drawer");
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(400);
  }

  console.log("Capturing B2B Overview…");
  await page.goto(`${BASE}/sales-operation/b2b-clients`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "04-b2b-overview");

  // Click first client row / link if available
  const clientLink = page.locator('a[href*="/sales-operation/b2b-clients/"]').first();
  const clickableRow = page.locator("table tbody tr, [role='row']").first();
  if (await clientLink.count()) {
    await clientLink.click();
  } else if (await clickableRow.count()) {
    await clickableRow.click();
  }
  await page.waitForTimeout(2500);
  if (page.url().includes("/b2b-clients/") && !page.url().endsWith("/b2b-clients")) {
    await save(page, "05-client-profile");
  } else {
    // Ensure via API then navigate to first client from list response is hard;
    // fallback: open pipeline signed client if any.
    console.log("  no client profile route — trying ensure from overview search");
    await page.goto(`${BASE}/sales-operation/b2b-clients`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const search = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').first();
    if (await search.count()) {
      await search.fill("a");
      await page.waitForTimeout(800);
    }
    const rowBtn = page.locator("tbody tr").first();
    if (await rowBtn.count()) {
      await rowBtn.click();
      await page.waitForTimeout(2500);
      if (page.url().includes("/b2b-clients/")) {
        await save(page, "05-client-profile");
      }
    }
  }

  console.log("Capturing Pipeline…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await save(page, "06-pipeline");

  // Open a lead card if present
  const leadCard = page.locator("[data-lead-id], .so-card, [class*='lead']").first();
  const columnCard = page.locator("button, div").filter({ hasText: /@|₪|\+/ }).first();
  // Prefer clicking first visible card in kanban
  const kanbanCard = page.locator("[draggable='true']").first();
  if (await kanbanCard.count()) {
    await kanbanCard.click();
    await page.waitForTimeout(1500);
    await save(page, "07-lead-detail");
    // Try tasks tab
    const tasksTab = page.getByRole("tab", { name: /task/i }).first();
    if (await tasksTab.count()) {
      await tasksTab.click();
      await page.waitForTimeout(800);
      await save(page, "08-lead-tasks");
    }
  } else {
    console.log("  no lead card found for detail shots");
  }

  await browser.close();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
