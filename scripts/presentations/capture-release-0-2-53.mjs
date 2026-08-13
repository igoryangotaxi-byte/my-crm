/**
 * Capture screenshots for 0.2.53 Yango corp register + Signed Corp Client ID.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-53");
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

async function leadCards(page) {
  return page.locator('[role="group"][draggable="true"]');
}

async function clickFirstLead(page) {
  const card = (await leadCards(page)).first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(1400);
    return true;
  }
  return false;
}

async function scrollBoardToEnd(page) {
  const board = page.locator("div.flex.min-h-0.flex-1.gap-3.overflow-x-auto").first();
  if (await board.count()) {
    await board.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(400);
  }
}

async function clickSignedLead(page) {
  await scrollBoardToEnd(page);
  const signedHeader = page.getByText(/^Signed$/).first();
  if (await signedHeader.count()) {
    await signedHeader.scrollIntoViewIfNeeded().catch(() => null);
  }
  const signedCol = page
    .locator("div.w-\\[17rem\\]")
    .filter({ hasText: /Signed/ })
    .first();
  const inCol = signedCol.locator('[role="group"][draggable="true"]').first();
  if (await inCol.count()) {
    await inCol.locator("p").first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  const cards = await leadCards(page);
  const count = await cards.count();
  if (count > 0) {
    await cards.nth(Math.max(0, count - 1)).locator("p").first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  return clickFirstLead(page);
}

async function tryOpenSignedGate(page) {
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(400);
  const negCol = page.locator("div.w-\\[17rem\\]").filter({ hasText: /Negotiation/ }).first();
  const sourceCard = negCol.locator('[role="group"][draggable="true"]').first();
  if (!(await sourceCard.count())) return false;
  await sourceCard.locator("p").first().click();
  await page.waitForTimeout(1400);
  const status = page.getByRole("dialog").locator("select").first();
  if (await status.count()) {
    await status
      .selectOption({ label: /Signed/i })
      .catch(async () => status.selectOption("signed").catch(() => null));
  }
  const save = page.getByRole("button", { name: /Save lead/i }).first();
  if (await save.count()) await save.click();
  await page.waitForTimeout(2500);
  return Boolean(await page.getByRole("dialog").filter({ hasText: /Corp Client ID/i }).count());
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

  console.log("01 Pipeline…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await save(page, "01-pipeline");

  console.log("02 Lead overview + Yango accordion…");
  await clickFirstLead(page);
  const drawer = page.getByRole("dialog").first();
  const accordion = drawer.getByRole("button", { name: /Yango client registration/i }).first();
  if (await accordion.count()) {
    await accordion.scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(500);
  } else {
    const fallback = page.getByRole("button", { name: /Yango client registration/i }).first();
    if (await fallback.count()) await fallback.scrollIntoViewIfNeeded().catch(() => null);
  }
  await save(page, "02-lead-yango-collapsed");

  console.log("03 Expand Yango registration…");
  const accordionBtn = (await accordion.count())
    ? accordion
    : page.getByRole("button", { name: /Yango client registration/i }).first();
  if (await accordionBtn.count()) {
    await accordionBtn.click();
    await page.waitForTimeout(1200);
    await page.locator("iframe[title*='Yango'], iframe[src*='corp-register']").first().waitFor({ timeout: 8000 }).catch(() => null);
    await accordionBtn.scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(1800);
  }
  await save(page, "03-lead-yango-open");

  console.log("04 Client details / managers…");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await clickSignedLead(page);
  const details = page.getByText(/^Client details$/i).first();
  if (await details.count()) {
    await details.scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(500);
  }
  const b2bSearch = page.getByPlaceholder(/Search by name or corp_client_id/i).first();
  if (await b2bSearch.count()) {
    await b2bSearch.click();
    await b2bSearch.fill("a");
    await page.waitForTimeout(900);
  }
  await save(page, "04-client-details-managers");

  console.log("05 Signed stage gate…");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const openedGate = await tryOpenSignedGate(page);
  console.log(openedGate ? "  gate opened" : "  gate not opened, capturing board");
  await page.waitForTimeout(600);
  await save(page, "05-signed-stage-gate");

  console.log("06 Corp register page…");
  await page.goto(`${BASE}/sales-operation/corp-register`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await save(page, "06-corp-register");

  console.log("07 B2B Overview…");
  await page.goto(`${BASE}/sales-operation/b2b-clients`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const search = page.getByPlaceholder(/search|filter|corp/i).first();
  if (await search.count()) {
    await search.click().catch(() => null);
    await search.fill("a").catch(() => null);
    await page.waitForTimeout(800);
  }
  await save(page, "07-b2b-overview");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
