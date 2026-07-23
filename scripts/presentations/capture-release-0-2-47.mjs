/**
 * Capture screenshots for 0.2.47 release deck: Tracker + My Space mentions.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/release-0-2-47");
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

async function ensureDemoProject(page) {
  const list = await page.evaluate(async () => {
    const res = await fetch("/api/sales-operation/tracker/projects", { cache: "no-store" });
    return res.json();
  });
  if (list?.ok && Array.isArray(list.projects) && list.projects.length > 0) {
    return list.projects[0].id;
  }
  const created = await page.evaluate(async () => {
    const res = await fetch("/api/sales-operation/tracker/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sales Ops Launch",
        description: "Demo board for Tracker onboarding",
      }),
    });
    return res.json();
  });
  if (!created?.ok || !created.project?.id) {
    console.warn("  could not create demo project:", created?.error || created);
    return null;
  }
  const projectId = created.project.id;
  const board = await page.evaluate(async (id) => {
    const res = await fetch(`/api/sales-operation/tracker/projects/${id}`, { cache: "no-store" });
    return res.json();
  }, projectId);
  const statusId = board?.statuses?.[0]?.id;
  if (statusId) {
    await page.evaluate(
      async ({ projectId: pid, statusId: sid }) => {
        await fetch(`/api/sales-operation/tracker/projects/${pid}/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Kickoff Tracker board for the team",
            statusId: sid,
            priority: "high",
            description: "Walk managers through columns, assignees, and @mentions.",
          }),
        });
        await fetch(`/api/sales-operation/tracker/projects/${pid}/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Wire My Space Tracker tab",
            statusId: sid,
            priority: "normal",
          }),
        });
      },
      { projectId, statusId },
    );
  }
  return projectId;
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

  console.log("Capturing Tracker projects…");
  await page.goto(`${BASE}/sales-operation/tracker`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const projectId = await ensureDemoProject(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await save(page, "01-tracker-projects");

  if (projectId) {
    console.log("Capturing Tracker board…");
    await page.goto(`${BASE}/sales-operation/tracker/${projectId}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await save(page, "02-tracker-board");

    const ticketList = await page.evaluate(async (id) => {
      const res = await fetch(
        `/api/sales-operation/tracker/projects/${id}/tickets?includeArchived=0`,
        { cache: "no-store" },
      );
      return res.json();
    }, projectId);
    const ticketId =
      ticketList?.tickets?.find((t) => !t.archivedAt && !t.parentTicketId)?.id ||
      ticketList?.tickets?.[0]?.id ||
      null;

    if (ticketId) {
      console.log("Capturing ticket drawer…");
      await page.goto(
        `${BASE}/sales-operation/tracker/${projectId}?ticket=${ticketId}`,
        { waitUntil: "networkidle" },
      );
      await page.waitForTimeout(1800);
      await save(page, "03-ticket-drawer");

      const comment = page.locator("textarea").filter({ hasText: "" }).last();
      const anyTextarea = page.locator("aside textarea, [role='dialog'] textarea, textarea").last();
      const target = (await comment.count()) ? comment : anyTextarea;
      if (await target.count()) {
        await target.click();
        await target.fill("");
        await target.type("@", { delay: 50 });
        await page.waitForTimeout(800);
        await save(page, "04-mention-composer");
      }
      await page.keyboard.press("Escape").catch(() => null);
      await page.waitForTimeout(400);
    } else {
      console.log("  no tickets on board — skipping drawer shots");
    }
  } else {
    console.log("  no project — board shots skipped (apply SQL first)");
  }

  console.log("Capturing My Space (Tracker tab)…");
  await page.goto(`${BASE}/sales-operation/tasks?tab=tracker`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const trackerTab = page.getByRole("button", { name: /tracker/i }).or(page.getByText(/^Tracker$/i));
  if (await trackerTab.count()) {
    await trackerTab.first().click().catch(() => null);
    await page.waitForTimeout(1000);
  }
  await save(page, "05-myspace-tracker");

  console.log("Capturing Calendar (tracker due dates)…");
  await page.goto(`${BASE}/sales-operation/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await save(page, "06-calendar");

  console.log("Capturing Pipeline (sidebar context)…");
  await page.goto(`${BASE}/sales-operation/pipeline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await save(page, "07-pipeline-sidebar");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
