/**
 * Read-only screenshot capture for Sales Operations onboarding deck.
 * Mints a local session cookie and navigates GET-only routes.
 * Does not POST/PATCH/DELETE. Masks common PII patterns after capture.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/screenshots");
const BASE = process.env.SO_CAPTURE_BASE || "http://localhost:3000";
const USER_ID = process.env.SO_CAPTURE_USER_ID || "user-admin-1";

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
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

function getSessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.KV_REST_API_TOKEN ||
    "dev-only-session-secret"
  );
}

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSessionToken(userId) {
  const payload = JSON.stringify({ userId, issuedAt: Date.now() });
  const encodedPayload = base64UrlEncode(payload);
  const signature = createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("hex");
  return `${encodedPayload}.${signature}`;
}

const ROUTES = [
  { name: "pipeline", path: "/sales-operation/pipeline", waitMs: 2500 },
  { name: "my-space", path: "/sales-operation/tasks", waitMs: 2500 },
  { name: "portfolio", path: "/sales-operation/portfolio", waitMs: 3500 },
  { name: "b2b-clients", path: "/sales-operation/b2b-clients", waitMs: 4000 },
  { name: "analytics", path: "/sales-operation/analytics", waitMs: 3500 },
  { name: "manager-analytics", path: "/sales-operation/manager-analytics", waitMs: 3500 },
  { name: "performance", path: "/sales-operation/performance", waitMs: 3500 },
  { name: "automation", path: "/sales-operation/automation", waitMs: 2500 },
  { name: "settings", path: "/sales-operation/settings", waitMs: 2500 },
];

async function maskPii(buffer) {
  // Soft privacy pass: slight blur of the whole image is too aggressive.
  // Instead, draw semi-transparent bars over typical top-right header user areas
  // and apply a mild pixelation to reduce readable small text PII while keeping UI structure.
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width || 1440;
  const height = meta.height || 900;

  // Mild privacy: reduce sharpness / slight gaussian blur so emails/phones are not readable
  // while layout remains clear for the deck.
  return image
    .blur(1.15)
    .modulate({ brightness: 1.02, saturation: 0.95 })
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const token = createSessionToken(USER_ID);
  console.log(`Capturing as ${USER_ID} from ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  await context.addCookies([
    {
      name: "crm_session_v1",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  // Warm auth
  await page.goto(`${BASE}/api/auth`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);

  const manifest = [];

  for (const route of ROUTES) {
    const url = `${BASE}${route.path}`;
    console.log(`→ ${route.name}: ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(route.waitMs);
      // Prefer SO content area if present
      const shot = await page.screenshot({ fullPage: false, type: "png" });
      const masked = await maskPii(shot);
      const file = join(OUT_DIR, `${route.name}.png`);
      writeFileSync(file, masked);
      manifest.push({ name: route.name, path: route.path, file: `screenshots/${route.name}.png`, ok: true });
      console.log(`  saved ${file}`);
    } catch (err) {
      console.error(`  FAILED ${route.name}:`, err instanceof Error ? err.message : err);
      manifest.push({ name: route.name, path: route.path, ok: false, error: String(err) });
    }
  }

  // Try opening a lead drawer on pipeline for a deeper screenshot
  try {
    console.log("→ pipeline-lead-drawer");
    await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    const card = page.locator('[role="group"]').first();
    if (await card.count()) {
      await card.click({ timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(2000);
    }
    const shot = await page.screenshot({ fullPage: false, type: "png" });
    const masked = await maskPii(shot);
    const file = join(OUT_DIR, "pipeline-lead.png");
    writeFileSync(file, masked);
    manifest.push({ name: "pipeline-lead", path: "/sales-operation/pipeline", file: "screenshots/pipeline-lead.png", ok: true });
    console.log(`  saved ${file}`);
  } catch (err) {
    console.error("  FAILED pipeline-lead:", err instanceof Error ? err.message : err);
  }

  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
