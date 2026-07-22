/**
 * Generate Yango Sales Operations onboarding PPTX (English, executive).
 * Usage: node scripts/presentations/generate-sales-operation-onboarding-pptx.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const OUT = join(ROOT, "docs/presentations/Yango-Sales-Operations-Onboarding.pptx");

const C = {
  accent: "FF2D2D",
  accentStrong: "C70F1F",
  text: "14161A",
  muted: "6B7280",
  muted2: "8A919E",
  bg: "F5F6F8",
  white: "FFFFFF",
  border: "E9EBF0",
  soft: "FFF1F1",
  dark: "0F1115",
  green: "059669",
  amber: "D97706",
};

const FONT_TITLE = "Arial";
const FONT_BODY = "Arial";

function shot(name) {
  const p = join(ASSETS, "screenshots", `${name}.png`);
  return existsSync(p) ? p : null;
}

function logoPath() {
  const p = join(ASSETS, "yango-logo.png");
  return existsSync(p) ? p : null;
}

function addAccentBar(slide) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.08,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
}

function addFooter(slide, page, total) {
  slide.addText("Yango · Sales Operations Onboarding · Confidential", {
    x: 0.5,
    y: 7.15,
    w: 10,
    h: 0.3,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: C.muted2,
  });
  slide.addText(`${page} / ${total}`, {
    x: 11.5,
    y: 7.15,
    w: 1.3,
    h: 0.3,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: C.muted2,
    align: "right",
  });
}

function addSectionLabel(slide, label) {
  slide.addText(label.toUpperCase(), {
    x: 0.5,
    y: 0.28,
    w: 12,
    h: 0.28,
    fontSize: 11,
    fontFace: FONT_BODY,
    color: C.accent,
    bold: true,
    charSpacing: 2,
  });
}

function addTitle(slide, title) {
  slide.addText(title, {
    x: 0.5,
    y: 0.55,
    w: 12.3,
    h: 0.55,
    fontSize: 28,
    fontFace: FONT_TITLE,
    color: C.text,
    bold: true,
  });
}

function addBody(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.5,
    y: opts.y ?? 1.2,
    w: opts.w ?? 6,
    h: opts.h ?? 5,
    fontSize: opts.fontSize ?? 14,
    fontFace: FONT_BODY,
    color: opts.color ?? C.text,
    valign: "top",
    ...opts.extra,
  });
}

function addBulletBlock(slide, items, opts = {}) {
  slide.addText(
    items.map((t) => ({
      text: t,
      options: { bullet: true, breakLine: true },
    })),
    {
      x: opts.x ?? 0.5,
      y: opts.y ?? 1.25,
      w: opts.w ?? 6.2,
      h: opts.h ?? 5.2,
      fontSize: opts.fontSize ?? 13,
      fontFace: FONT_BODY,
      color: C.text,
      paraSpaceAfter: 6,
      valign: "top",
    },
  );
}

function addScreenshot(slide, name, opts = {}) {
  const p = shot(name);
  if (!p) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: opts.x ?? 7.0,
      y: opts.y ?? 1.25,
      w: opts.w ?? 5.8,
      h: opts.h ?? 5.2,
      fill: { color: C.bg },
      line: { color: C.border, width: 1 },
      rectRadius: 0.1,
    });
    slide.addText(`Screenshot: ${name}`, {
      x: opts.x ?? 7.0,
      y: (opts.y ?? 1.25) + (opts.h ?? 5.2) / 2 - 0.2,
      w: opts.w ?? 5.8,
      h: 0.4,
      fontSize: 12,
      color: C.muted,
      align: "center",
    });
    return;
  }
  slide.addImage({
    path: p,
    x: opts.x ?? 7.0,
    y: opts.y ?? 1.25,
    w: opts.w ?? 5.8,
    h: opts.h ?? 5.2,
    rounding: { tl: 0.08, tr: 0.08, br: 0.08, bl: 0.08 },
  });
}

function addCard(slide, x, y, w, h, title, body) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: C.white },
    line: { color: C.border, width: 1 },
    rectRadius: 0.08,
    shadow: { type: "outer", color: "000000", blur: 8, opacity: 0.06, offset: 2 },
  });
  slide.addText(title, {
    x: x + 0.2,
    y: y + 0.18,
    w: w - 0.4,
    h: 0.35,
    fontSize: 14,
    fontFace: FONT_TITLE,
    color: C.accent,
    bold: true,
  });
  slide.addText(body, {
    x: x + 0.2,
    y: y + 0.55,
    w: w - 0.4,
    h: h - 0.75,
    fontSize: 12,
    fontFace: FONT_BODY,
    color: C.text,
    valign: "top",
  });
}

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.title = "Yango Sales Operations Onboarding";
pptx.subject = "Executive onboarding for the Sales Operations platform";

const TOTAL = 26;

function slideBase(notes) {
  const s = pptx.addSlide();
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: C.white },
  });
  addAccentBar(s);
  if (notes) s.addNotes(notes);
  return s;
}

// 1 Title
{
  const s = slideBase(
    "Welcome the Yango owner. Position this as the operating system for B2B sales from lead to live client performance.",
  );
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: C.dark },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: C.accent },
  });
  const logo = logoPath();
  if (logo) {
    s.addImage({ path: logo, x: 0.7, y: 1.4, w: 1.4, h: 1.4 });
  }
  s.addText("YANGO", {
    x: 2.3,
    y: 1.55,
    w: 8,
    h: 0.45,
    fontSize: 18,
    fontFace: FONT_BODY,
    color: C.accent,
    bold: true,
    charSpacing: 4,
  });
  s.addText("Sales Operations Platform", {
    x: 2.3,
    y: 2.05,
    w: 10,
    h: 0.8,
    fontSize: 40,
    fontFace: FONT_TITLE,
    color: C.white,
    bold: true,
  });
  s.addText(
    "Executive onboarding — what it is, why it exists, how every section works,\nand what depends on what.",
    {
      x: 2.3,
      y: 3.0,
      w: 9.5,
      h: 1.0,
      fontSize: 16,
      fontFace: FONT_BODY,
      color: "D1D5DB",
    },
  );
  s.addText("Appli Taxi Oz  ·  Internal CRM module  ·  English walkthrough", {
    x: 2.3,
    y: 6.4,
    w: 9,
    h: 0.35,
    fontSize: 12,
    fontFace: FONT_BODY,
    color: C.muted2,
  });
}

// 2 Access prerequisite
{
  const s = slideBase(
    "Start with the access prerequisite: this is an internal platform, not a public signup product.",
  );
  addFooter(s, 2, TOTAL);
  addSectionLabel(s, "Access prerequisite");
  addTitle(s, "Access is restricted to @appli.taxi accounts");

  addBulletBlock(
    s,
    [
      "Sign-in is available only through Google Workspace.",
      "The Google account must use the corporate @appli.taxi email domain.",
      "Personal Gmail and external company accounts are rejected.",
      "After sign-in, the user must also be approved and have the required Sales Operations role permissions.",
      "This protects internal lead, client, trip, revenue and manager-performance data.",
    ],
    { y: 1.35, h: 4.9, w: 6.2, fontSize: 14 },
  );

  const loginScreenshot = join(ASSETS, "appli-taxi-login.png");
  if (existsSync(loginScreenshot)) {
    s.addImage({
      path: loginScreenshot,
      x: 7.0,
      y: 1.35,
      w: 5.8,
      h: 4.55,
    });
  }

  s.addShape(pptx.ShapeType.roundRect, {
    x: 7.0,
    y: 6.1,
    w: 5.8,
    h: 0.55,
    fill: { color: C.soft },
    line: { color: C.accent, width: 1 },
    rectRadius: 0.06,
  });
  s.addText("Required identity:  name@appli.taxi", {
    x: 7.2,
    y: 6.23,
    w: 5.4,
    h: 0.28,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: C.accentStrong,
    bold: true,
    align: "center",
  });
}

// 3 Why
{
  const s = slideBase(
    "Explain the pain: leads, signed clients, B2B ride data and manager accountability lived in different places. SO unifies them.",
  );
  addFooter(s, 3, TOTAL);
  addSectionLabel(s, "Why this exists");
  addTitle(s, "From scattered sales work to one operating system");
  addCard(
    s,
    0.5,
    1.35,
    3.9,
    5.0,
    "The problem",
    "Leads arrive from forms and manual entry.\nManagers chase follow-ups in chat.\nSigned clients must be linked to Yango corp IDs.\nPerformance (GMV, trips, decoupling) lives outside the CRM.\nTargets and accountability are hard to see.",
  );
  addCard(
    s,
    4.7,
    1.35,
    3.9,
    5.0,
    "The platform",
    "One Sales Operations module for:\n• Pipeline execution\n• Personal work (My Space)\n• Signed-client portfolio\n• B2B performance from Yango data\n• Analytics, KPIs & targets\n• Automations & notifications\n• Configurable stages & segments",
  );
  addCard(
    s,
    8.9,
    1.35,
    3.9,
    5.0,
    "The outcome",
    "Owner visibility: who is selling, where deals sit, which clients perform, and whether managers hit targets — without leaving the CRM.",
  );
}

// 3 Platform map
{
  const s = slideBase("Walk the map left-to-right: execute → convert → measure → govern.");
  addFooter(s, 4, TOTAL);
  addSectionLabel(s, "Platform map");
  addTitle(s, "How the sections connect");

  const boxes = [
    { x: 0.5, label: "My Space", sub: "Tasks · Notes · Scorecard" },
    { x: 3.0, label: "Pipeline", sub: "Leads → Signed" },
    { x: 5.5, label: "AM Portfolio", sub: "Signed clients" },
    { x: 8.0, label: "B2B Overview", sub: "Yango trips · GMV" },
    { x: 10.5, label: "Analytics", sub: "Funnel · Forecast" },
  ];
  for (const b of boxes) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: b.x,
      y: 1.5,
      w: 2.2,
      h: 1.35,
      fill: { color: C.soft },
      line: { color: C.accent, width: 1.5 },
      rectRadius: 0.1,
    });
    s.addText(b.label, {
      x: b.x + 0.1,
      y: 1.7,
      w: 2.0,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: C.text,
      align: "center",
    });
    s.addText(b.sub, {
      x: b.x + 0.1,
      y: 2.2,
      w: 2.0,
      h: 0.4,
      fontSize: 11,
      color: C.muted,
      align: "center",
    });
  }
  for (let i = 0; i < 4; i++) {
    s.addText("→", {
      x: boxes[i].x + 2.15,
      y: 1.9,
      w: 0.4,
      h: 0.4,
      fontSize: 18,
      color: C.accent,
      bold: true,
    });
  }

  const lower = [
    { x: 0.5, label: "Performance", sub: "KPI targets vs actuals" },
    { x: 3.7, label: "Automation", sub: "Status → SMS / assign / task" },
    { x: 6.9, label: "Settings", sub: "Stages · Segments · Templates" },
    { x: 10.1, label: "Integrations", sub: "WPForms · Email · SMS · Cron" },
  ];
  for (const b of lower) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: b.x,
      y: 3.4,
      w: 2.9,
      h: 1.2,
      fill: { color: C.bg },
      line: { color: C.border, width: 1 },
      rectRadius: 0.1,
    });
    s.addText(b.label, {
      x: b.x + 0.15,
      y: 3.55,
      w: 2.6,
      h: 0.35,
      fontSize: 14,
      bold: true,
      color: C.text,
      align: "center",
    });
    s.addText(b.sub, {
      x: b.x + 0.15,
      y: 3.95,
      w: 2.6,
      h: 0.4,
      fontSize: 11,
      color: C.muted,
      align: "center",
    });
  }

  s.addText(
    "Settings is the control plane: stage labels, probabilities and segments feed Pipeline, Analytics, Automation and forecast weighting.\nSigned in Pipeline creates a client → Portfolio / Client profile → B2B link unlocks Yango GMV & trip metrics used in KPIs.",
    {
      x: 0.5,
      y: 5.0,
      w: 12.3,
      h: 1.5,
      fontSize: 13,
      color: C.text,
    },
  );
}

// 4 Access
{
  const s = slideBase("Clarify who sees what. Admin owns Settings & Team Performance.");
  addFooter(s, 5, TOTAL);
  addSectionLabel(s, "Access & roles");
  addTitle(s, "Who can use which parts");
  s.addTable(
    [
      [
        { text: "Role", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Typical access", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Notes", options: { bold: true, color: C.white, fill: { color: C.accent } } },
      ],
      ["Admin", "All SO pages including Settings & Team Performance", "Can set KPI targets"],
      ["Account Manager", "Pipeline, Portfolio, B2B, Analytics, Automation, My Space", "No Settings by default"],
      ["Sales Manager", "Same operational set as AM", "No Settings by default"],
      ["User / Team Lead", "No Sales Operations by default", "Can be granted via Accesses"],
    ],
    {
      x: 0.5,
      y: 1.3,
      w: 12.3,
      h: 3.2,
      colW: [2.4, 6.2, 3.7],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: FONT_BODY,
      fontSize: 12,
      color: C.text,
      align: "left",
      valign: "middle",
    },
  );
  addBulletBlock(
    s,
    [
      "Two-level gate: module permission (salesOperation) + page permission (pipeline, B2B, analytics, settings…).",
      "Access Management can override defaults per role.",
      "Clients of the CRM are redirected away from this module.",
    ],
    { y: 4.8, h: 1.8, w: 12.3 },
  );
}

// 5 Shell
{
  const s = slideBase("Point at sidebar, search, notifications on the screenshot.");
  addFooter(s, 6, TOTAL);
  addSectionLabel(s, "Shell");
  addTitle(s, "Shared Sales Operations shell");
  addBulletBlock(
    s,
    [
      "Left sidebar: My Space, Pipeline, AM Portfolio, B2B, Analytics (nested), Automation, Settings.",
      "Header: global search across leads, clients and contacts.",
      "Notification bell (polls ~60s): assignments, mentions, task due, automation.",
      "EN / HE language switch for the whole CRM UI.",
      "Back to CRM returns to the main Appli Taxi product shell.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "pipeline", { x: 7.0, y: 1.25, w: 5.8, h: 5.2 });
}

// 6 My Space
{
  const s = slideBase("Emphasize private vs assigned: personal tasks/notes are user-scoped.");
  addFooter(s, 7, TOTAL);
  addSectionLabel(s, "My Space");
  addTitle(s, "Personal execution hub");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/tasks",
      "My Tasks — private standalone tasks (priority, due, status).",
      "Assigned — lead-linked tasks assigned to you (overdue / today / upcoming).",
      "Notes — private, pinnable personal notes (not on the lead).",
      "Scorecard — your KPI actuals vs admin-set targets.",
      "Depends on: salesPipeline permission; Scorecard also needs manager-analytics APIs.",
      "Privacy: personal tasks/notes filtered by authenticated user_id on every request.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "my-space");
}

// 7 Pipeline
{
  const s = slideBase("Show the kanban. Mention create lead, filters, saved views.");
  addFooter(s, 8, TOTAL);
  addSectionLabel(s, "Pipeline");
  addTitle(s, "Lead kanban — the core workflow");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/pipeline",
      "Configurable columns from Settings (order, labels, active flags).",
      "Create lead: name + email or phone; live duplicate check.",
      "Filters: owner, segment, campaign, source, search, potential range.",
      "Saved views & collapsed columns remembered per user (browser).",
      "Drag leads between stages; edit monthly potential inline on the card.",
      "Depends on: pipeline stages & segments config; lead APIs.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "pipeline");
}

// 8 Lead card
{
  const s = slideBase("Open a lead mentally: tabs are the day-to-day workspace.");
  addFooter(s, 9, TOTAL);
  addSectionLabel(s, "Lead workspace");
  addTitle(s, "Lead drawer — everything about one deal");
  addBulletBlock(
    s,
    [
      "Overview — status, contact fields, segment, monthly potential ₪.",
      "Contacts — multiple contacts, primary / decision-maker flags.",
      "Activity — timeline of status changes, notes, tasks, emails, logs.",
      "Tasks — lead tasks with assignees and due dates.",
      "Files — attachments via Supabase Storage (signed download URLs).",
      "Email — compose from templates; thread of sent/received messages.",
      "Quick actions: Call, Email, WhatsApp, SMS, Log call/meeting/WhatsApp.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "pipeline-lead");
}

// 9 Rules
{
  const s = slideBase("Critical business rules — no bounce on Negotiation.");
  addFooter(s, 10, TOTAL);
  addSectionLabel(s, "Pipeline rules");
  addTitle(s, "How leads are allowed to move");
  addCard(
    s,
    0.5,
    1.35,
    6.0,
    5.0,
    "Movement rules",
    "• Leads move freely across active stages (including Negotiation & Proposal Sent).\n• New cannot jump directly to Signed or Rejected.\n• Signed is terminal — cannot move again or be hard-deleted.\n• First status move auto-assigns an unowned lead to the acting user.\n• Archive soft-hides a lead without destroying history.\n• Monthly potential is recommended for forecast quality, but does not block stage moves.",
  );
  addCard(
    s,
    6.8,
    1.35,
    6.0,
    5.0,
    "What happens on Signed",
    "1. Create/update sales_clients record\n2. Copy lead notes → client notes\n3. Keep lead linked (history preserved)\n4. Audit + activity events\n5. Notify owning manager if someone else signed\n6. Run enabled status-change automations\n\nThen: managers link corp_client_id for B2B metrics.",
  );
}

// 10 Potential
{
  const s = slideBase("Potential drives weighted pipeline = potential × stage probability.");
  addFooter(s, 11, TOTAL);
  addSectionLabel(s, "Forecast inputs");
  addTitle(s, "Monthly potential & weighted pipeline");
  addBulletBlock(
    s,
    [
      "Estimated monthly potential (₪) editable on the card and in Overview.",
      "Optimistic save with toast feedback and rollback on error.",
      "Weighted value = potential × (lead probability override OR stage probability from Settings).",
      "Default stage probabilities: New 10% → In Progress 30% → Proposal 50% → Negotiation 70% → Signed 100% → Rejected 0%.",
      "Used in Analytics forecast and Team Performance “weighted forecast” KPI.",
      "Depends on: Settings stage probabilities; lead field estimatedMonthlyPotential.",
    ],
    { y: 1.25, h: 5.2, w: 12.3 },
  );
}

// 11 Portfolio
{
  const s = slideBase("Portfolio is the post-sale AM view.");
  addFooter(s, 12, TOTAL);
  addSectionLabel(s, "AM Portfolio");
  addTitle(s, "Signed clients grouped by Account Manager");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/portfolio",
      "Groups clients by AM; shows GMV, trips, health mix, last-trip recency.",
      "Default ~90-day range (adjustable).",
      "Surfaces unassigned clients that still need an AM.",
      "Depends on: Signed conversion from Pipeline; B2B corp link for ride metrics; salesSignedClients permission.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "portfolio");
}

// 12 Client profile
{
  const s = slideBase("Client profile is the bridge between CRM and Yango corp client.");
  addFooter(s, 13, TOTAL);
  addSectionLabel(s, "Client profile");
  addTitle(s, "Signed client detail");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/b2b-clients/[id]",
      "Company/contact/campaign snapshot from the signed lead.",
      "Assign Account Manager & Sales Manager.",
      "Link to Yango corp_client_id via B2B registry search.",
      "Health score + reasons (recency, volume, decoupling).",
      "Requests, completed trips, GMV, decoupling, recent trips.",
      "Depends on: salesSignedClients; gp_corp_client_map + order facts for metrics.",
    ],
    { y: 1.25, h: 5.2, w: 12.3 },
  );
}

// 13 B2B
{
  const s = slideBase("B2B Overview is where Yango operational data meets CRM ownership.");
  addFooter(s, 14, TOTAL);
  addSectionLabel(s, "B2B Clients");
  addTitle(s, "B2B Clients Overview — live performance");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/b2b-clients",
      "Joins Yango order metrics with corp-client map and CRM managers.",
      "KPI tiles with previous-period deltas and sparklines.",
      "Virtualized table, selection, bulk CSV export.",
      "Edit managers in a drawer; open Yango corp admin when linked.",
      "Shows signed CRM clients still awaiting a B2B corp link.",
      "Depends on: Greenplum/Yango order facts + manager registry.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "b2b-clients");
}

// 14 Trips
{
  const s = slideBase("Trip drill-down is the audit trail for a single corp client.");
  addFooter(s, 15, TOTAL);
  addSectionLabel(s, "Trip drill-down");
  addTitle(s, "Per-client trips & decoupling");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/b2b-clients/trips?corpClientId&from&to",
      "Summary: rows, completed trips, client spend, total decoupling.",
      "Premium table: date, order, status, client paid, driver received, flag.",
      "Links out to Yango order / corp admin for operational follow-up.",
      "Depends on: valid corpClientId + date range; Yango order data.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, shot("trips") ? "trips" : "b2b-clients");
}

// 15 Analytics
{
  const s = slideBase("Analytics is the executive dashboard for the pipeline.");
  addFooter(s, 16, TOTAL);
  addSectionLabel(s, "Analytics");
  addTitle(s, "Funnel, aging, win/loss & forecast");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/analytics",
      "Daily snapshot: new, moved forward, signed, rejected.",
      "Funnel by configured stage labels + conversion between stages.",
      "Aging buckets and average days in stage.",
      "Win rate, avg days to win; source & segment tables; CSV export.",
      "Weighted forecast by expected close month.",
      "Depends on: Settings stages/segments; lead potentials & probabilities.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "analytics");
}

// 16 Manager analytics
{
  const s = slideBase("Manager analytics is operational, not the target-setting screen.");
  addFooter(s, 17, TOTAL);
  addSectionLabel(s, "Manager Analytics");
  addTitle(s, "Performance by Account or Sales Manager");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/manager-analytics",
      "Filter by role (AM / SM), manager, and date range.",
      "Clients, requests, trips, GMV, decoupling — with CSV export.",
      "Attribution follows the B2B corp-client manager registry.",
      "Depends on: salesManagerAnalytics permission + linked corp clients.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "manager-analytics");
}

// 17 Performance
{
  const s = slideBase("Team Performance is the Monday-style scoreboard for owners.");
  addFooter(s, 18, TOTAL);
  addSectionLabel(s, "Team Performance");
  addTitle(s, "KPI targets vs actuals");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/performance (admin / Settings access).",
      "Ten metrics: signed, conversion %, leads worked, activities, tasks completed, avg cycle days, avg response hours, weighted forecast, GMV, trips.",
      "Period: month or quarter; unique target per manager × metric × period.",
      "Attainment colors: green ≥100%, yellow ≥70%, red <70% (invert for time metrics).",
      "My Scorecard inside My Space shows the same math for the signed-in user.",
      "Depends on: sales_kpi_targets table + pipeline/B2B activity data.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "performance");
}

// 18 Automation
{
  const s = slideBase("Automations run after a successful stage change — best effort.");
  addFooter(s, 19, TOTAL);
  addSectionLabel(s, "Automation");
  addTitle(s, "Status-triggered workflows");
  addBulletBlock(
    s,
    [
      "Routes: /sales-operation/automation and /automation/[id]",
      "Visual graph: Trigger (from → to status, including Any) then actions.",
      "Actions: SMS (InfoRU), Assign manager (fixed or round-robin), Create task.",
      "Only enabled workflows run; each run stores per-node ok/partial/error.",
      "Failures do not roll back the lead’s new stage.",
      "Depends on: configured stage keys/labels; SMS/email env when used.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "automation");
}

// 19 Notifications
{
  const s = slideBase("Notifications close the loop so managers do not miss work.");
  addFooter(s, 20, TOTAL);
  addSectionLabel(s, "Notifications");
  addTitle(s, "In-app alerts, mentions & reminders");
  addBulletBlock(
    s,
    [
      "Bell in the SO header: unread badge, mark one / mark all read.",
      "Events: lead assignment, task assignment, task due, @mentions, automation, system.",
      "@Full Name or @FirstName in lead notes creates a mention notification.",
      "Cron /api/sales-operation/cron/task-reminders: overdue or due-in-24h tasks (needs CRON_SECRET in production).",
      "Depends on: notifications table; authenticated user identity.",
    ],
    { y: 1.25, h: 5.2, w: 12.3 },
  );
}

// 20 Settings
{
  const s = slideBase("Settings is not cosmetic — it drives the whole module.");
  addFooter(s, 21, TOTAL);
  addSectionLabel(s, "Settings");
  addTitle(s, "Control plane — stages, segments, email templates");
  addBulletBlock(
    s,
    [
      "Route: /sales-operation/settings (Settings permission).",
      "Pipeline stages: order, label, probability, won/lost/terminal/active.",
      "Business segments: active list used on create/edit/filter/analytics.",
      "Email templates: EN/HE subjects & bodies with placeholders.",
      "Renames propagate to board, lead detail, activity, analytics, automation.",
      "Inactive segments cannot be assigned to new leads; occupied inactive stages stay visible.",
    ],
    { y: 1.25, h: 5.2, w: 6.2 },
  );
  addScreenshot(s, "settings");
}

// 21 Dependencies
{
  const s = slideBase("This is the ‘what depends on what’ slide — spend time here.");
  addFooter(s, 22, TOTAL);
  addSectionLabel(s, "Dependencies");
  addTitle(s, "What drives what");
  s.addTable(
    [
      [
        { text: "If you change…", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "It affects…", options: { bold: true, color: C.white, fill: { color: C.accent } } },
      ],
      ["Stage labels / order / active", "Kanban columns, funnel, automation status pickers, activity labels"],
      ["Stage probabilities", "Weighted forecast & Performance weighted KPI"],
      ["Won / Lost / Terminal flags", "Win-loss analytics, open pipeline, signing semantics"],
      ["Segments", "Lead forms, filters, segment analytics"],
      ["Signed transition", "Client record, Portfolio, client profile, handover path"],
      ["Corp client link + managers", "B2B Overview, trips, GMV/trips KPIs, Manager Analytics"],
      ["KPI targets (admin)", "Team Performance matrix & My Scorecard"],
      ["Enabled automations", "Side effects after status changes (SMS / assign / tasks)"],
    ],
    {
      x: 0.5,
      y: 1.3,
      w: 12.3,
      h: 5.2,
      colW: [4.5, 7.8],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: FONT_BODY,
      fontSize: 12,
      color: C.text,
      valign: "middle",
    },
  );
}

// 22 Integrations
{
  const s = slideBase("List env dependencies without dumping secrets.");
  addFooter(s, 23, TOTAL);
  addSectionLabel(s, "Integrations");
  addTitle(s, "External inputs & delivery channels");
  addCard(
    s,
    0.5,
    1.35,
    4.0,
    5.0,
    "Inbound",
    "• WPForms webhook → new leads\n  (SALES_OPERATION_WPFORMS_WEBHOOK_SECRET)\n• Inbound email → lead thread\n  (SALES_EMAIL_INBOUND_SECRET)\n• Yango / Greenplum facts\n  (orders, corp map)\n• Google SSO (@appli.taxi)",
  );
  addCard(
    s,
    4.7,
    1.35,
    4.0,
    5.0,
    "Outbound",
    "• SMTP email from lead Email tab\n  (SALES_SMTP_*)\n• InfoRU SMS (lead + automation)\n  (INFORU_*; automation needs enable flag)\n• Notifications inside the app",
  );
  addCard(
    s,
    8.9,
    1.35,
    4.0,
    5.0,
    "Scheduled",
    "• Task-due reminder cron\n  GET …/cron/task-reminders\n  Protect with CRON_SECRET in prod\n• Dedupes reminders ~20h\n• Does not mutate pipeline stages",
  );
}

// 23 Privacy
{
  const s = slideBase("Be honest about shared pipeline data vs private My Space.");
  addFooter(s, 24, TOTAL);
  addSectionLabel(s, "Data & privacy");
  addTitle(s, "What is private vs shared");
  addBulletBlock(
    s,
    [
      "Personal tasks & notes (My Space): scoped to the signed-in user_id — not visible to others via those APIs.",
      "Pipeline leads, lead notes, tasks, files, email: shared CRM records visible to users with pipeline access.",
      "Authorization is enforced in the application layer (approved user + permissions), not via Postgres RLS on SO tables.",
      "B2B metrics come from operational Yango datasets; manager attribution can credit both AM and SM for the same client.",
      "Screenshots in this deck are privacy-softened; treat live data as confidential.",
    ],
    { y: 1.25, h: 5.2, w: 12.3 },
  );
}

// 24 Checklist
{
  const s = slideBase("Leave the owner with a concrete operating checklist.");
  addFooter(s, 25, TOTAL);
  addSectionLabel(s, "Operating checklist");
  addTitle(s, "To run this well in production");
  addBulletBlock(
    s,
    [
      "Apply SQL migrations (including sales_kpi_targets & sales_personal_space) via db:apply:sales-operation or Supabase SQL Editor.",
      "Configure Accesses so AMs/SMs have the right page permissions; keep Settings for admins.",
      "Set stage probabilities & segments to match how you sell.",
      "Link signed clients to corp_client_id so GMV/trips feed Portfolio, B2B and KPIs.",
      "Set monthly/quarterly KPI targets on Team Performance.",
      "Enable SMTP / SMS / WPForms secrets only when those channels are ready.",
      "Protect the task-reminders cron with CRON_SECRET.",
      "Train managers: Pipeline daily, My Space for personal work, Portfolio for post-sale care.",
    ],
    { y: 1.25, h: 5.5, w: 12.3 },
  );
}

// 25 Closing
{
  const s = slideBase("Close with the one-liner: lead → signed → live B2B performance → accountable managers.");
  addFooter(s, 26, TOTAL);
  addSectionLabel(s, "Summary");
  addTitle(s, "What Yango gets with Sales Operations");
  const points = [
    { t: "Execute", d: "Pipeline + My Space keep every deal and every follow-up moving." },
    { t: "Convert", d: "Signed handover creates a client ready for AM ownership and B2B linking." },
    { t: "Measure", d: "Analytics, Manager views and Team Performance connect CRM work to Yango GMV." },
    { t: "Govern", d: "Settings, roles, automations and notifications keep the system consistent." },
  ];
  points.forEach((p, i) => {
    const y = 1.35 + i * 1.15;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y,
      w: 12.3,
      h: 1.0,
      fill: { color: i % 2 === 0 ? C.soft : C.bg },
      line: { color: C.border, width: 1 },
      rectRadius: 0.08,
    });
    s.addText(p.t, {
      x: 0.75,
      y: y + 0.25,
      w: 2.2,
      h: 0.45,
      fontSize: 18,
      bold: true,
      color: C.accent,
    });
    s.addText(p.d, {
      x: 3.1,
      y: y + 0.28,
      w: 9.3,
      h: 0.45,
      fontSize: 15,
      color: C.text,
    });
  });
}

await pptx.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT}`);
console.log(`Slides: ${pptx._slides?.length ?? TOTAL}`);
