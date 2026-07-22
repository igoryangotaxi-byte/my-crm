/**
 * Read-only-oriented capture of the My Space task hub and pipeline stage-gate flows.
 * Stage-gate capture uses preflight-only drag/drop; it never confirms the move.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/presentations/assets/feedback-flow");
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

async function closeTopDialog(page) {
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(350);
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
  page.setDefaultTimeout(12_000);

  console.log(`Capturing as ${USER_ID} from ${BASE}`);
  await page.goto(`${BASE}/api/auth`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);

  // My Space overview.
  await page.goto(`${BASE}/sales-operation/tasks`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2_500);
  await save(page, "01-my-space-overview");

  // Assigned tasks and the shared task drawer.
  const assignedTab = page.getByRole("tab", { name: /Assigned|שהוקצו/i }).first();
  if (await assignedTab.count()) {
    await assignedTab.click();
    await page.waitForTimeout(1_800);
    await save(page, "02-assigned-tasks");

    const firstTask = page.locator('article[role="button"]').first();
    if (await firstTask.count()) {
      await firstTask.click();
      await page.waitForTimeout(1_300);
      await save(page, "03-task-detail-drawer");

      const reassign = page.getByRole("button", { name: /Reassign|העבר/i }).first();
      if (await reassign.count()) {
        await reassign.click();
        await page.waitForTimeout(600);
        await save(page, "04-reassign-modal");
        await closeTopDialog(page);
      }

      const followUp = page.getByRole("button", { name: /Follow-up|המשך/i }).first();
      if (await followUp.count()) {
        await followUp.click();
        await page.waitForTimeout(600);
        await save(page, "05-follow-up-modal");
        await closeTopDialog(page);
      }
      await closeTopDialog(page);
    }
  }

  // Created by Me tab.
  const createdTab = page.getByRole("tab", { name: /Created by Me|שנוצרו על ידי/i }).first();
  if (await createdTab.count()) {
    await createdTab.click();
    await page.waitForTimeout(1_800);
    await save(page, "06-created-by-me");
    const createdTask = page.locator('article[role="button"]').first();
    if (await createdTask.count()) {
      await createdTask.click();
      await page
        .getByText(/Result summary|סיכום תוצאה/i, { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => null);
      await page.waitForTimeout(500);
      await save(page, "03-task-detail-drawer");

      const reassign = page.getByRole("button", { name: /Reassign|העבר/i }).first();
      if (await reassign.count()) {
        await reassign.click();
        await page.waitForTimeout(500);
        await save(page, "04-reassign-modal");
        await closeTopDialog(page);
      }

      const followUp = page.getByRole("button", { name: /Follow-up|המשך/i }).first();
      if (await followUp.count()) {
        await followUp.click();
        await page.waitForTimeout(500);
        await save(page, "05-follow-up-modal");
        await closeTopDialog(page);
      }
      await closeTopDialog(page);
    }
  }

  // Pipeline overview.
  await page.goto(`${BASE}/sales-operation/pipeline`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2_800);
  await save(page, "07-pipeline");

  // Pick a lead that produces a missing-requirements preflight.
  const candidate = await page.evaluate(async () => {
    const leadsRes = await fetch("/api/sales-operation/leads", { cache: "no-store" });
    const leadsJson = await leadsRes.json();
    const leads = Array.isArray(leadsJson?.leads) ? leadsJson.leads : [];
    const targets = {
      new: "in_progress",
      in_progress: "proposal_sent",
      proposal_sent: "negotiation",
      negotiation: "signed",
    };
    for (const lead of leads) {
      const toStatus = targets[lead.status];
      if (!toStatus) continue;
      const res = await fetch(`/api/sales-operation/leads/${lead.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, preflightOnly: true }),
      });
      const data = await res.json();
      if (res.ok && data?.ok === false && Array.isArray(data.missing) && data.missing.length) {
        return {
          id: lead.id,
          label: lead.companyName || lead.fullName,
          fromStatus: lead.status,
          toStatus,
          missing: data.missing,
        };
      }
    }
    return null;
  });

  // Lead Overview with the new commercial fields.
  if (candidate?.id) {
    await page.goto(`${BASE}/sales-operation/pipeline?lead=${encodeURIComponent(candidate.id)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2_300);
    const commercialField = page
      .getByText(/Pricing \/ proposal|תמחור \/ הצעה/i, { exact: true })
      .first();
    if (await commercialField.count()) {
      await commercialField.scrollIntoViewIfNeeded().catch(() => null);
      await page.waitForTimeout(400);
    }
    await save(page, "08-lead-overview-commercial-fields");
    await closeTopDialog(page);

    // Drag only when preflight is known to fail; this opens the modal without a transition.
    const source = page.getByText(candidate.label, { exact: true }).first();
    const targetLabel = {
      in_progress: /In Progress|בתהליך/i,
      proposal_sent: /Proposal Sent|הצעה נשלחה/i,
      negotiation: /Negotiation|משא ומתן/i,
      signed: /Signed|נחתם/i,
    }[candidate.toStatus];
    const target = targetLabel
      ? page.getByText(targetLabel, { exact: true }).first()
      : page.locator("body");
    if ((await source.count()) && (await target.count())) {
      await source.dragTo(target).catch(() => null);
      await page.waitForTimeout(1_200);
      const dialog = page.getByRole("dialog").last();
      if (await dialog.count()) {
        await save(page, "09-stage-gate-modal");
      }
    }
  }

  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify({ base: BASE, userId: USER_ID, candidate, capturedAt: new Date().toISOString() }, null, 2),
  );
  await browser.close();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
