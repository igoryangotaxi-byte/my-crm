/**
 * Feedback onboarding deck: My Space Task Hub + Pipeline Stage Gates.
 * Usage: node scripts/presentations/generate-task-hub-stage-gates-onboarding-pptx.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const FLOW = join(ASSETS, "feedback-flow");
const OUT = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Task-Hub-Stage-Gates-Onboarding.pptx",
);

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
  greenSoft: "ECFDF5",
  amber: "D97706",
  amberSoft: "FFFBEB",
  blue: "2563EB",
  blueSoft: "EFF6FF",
};

const FONT = "Arial";
const TOTAL = 17;

function flowShot(name) {
  const path = join(FLOW, `${name}.png`);
  return existsSync(path) ? path : null;
}

function logoPath() {
  const path = join(ASSETS, "yango-logo.png");
  return existsSync(path) ? path : null;
}

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.company = "Appli Taxi Oz";
pptx.subject = "Onboarding: My Space Task Hub and Pipeline Stage Gates";
pptx.title = "Yango Sales Operations — Task Hub & Stage Gates Onboarding";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: FONT,
  bodyFontFace: FONT,
  lang: "en-US",
};

function base(notes) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.08,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
  if (notes) slide.addNotes(notes);
  return slide;
}

function footer(slide, page) {
  slide.addText("Yango · Sales Operations Onboarding · Release 0.2.43 · Confidential", {
    x: 0.5,
    y: 7.16,
    w: 10.5,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted2,
  });
  slide.addText(`${page} / ${TOTAL}`, {
    x: 11.7,
    y: 7.16,
    w: 1.1,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted2,
    align: "right",
  });
}

function heading(slide, section, title, subtitle) {
  slide.addText(section.toUpperCase(), {
    x: 0.5,
    y: 0.25,
    w: 12.2,
    h: 0.24,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    charSpacing: 1.8,
    color: C.accent,
  });
  slide.addText(title, {
    x: 0.5,
    y: 0.53,
    w: 12.2,
    h: 0.52,
    fontFace: FONT,
    fontSize: 27,
    bold: true,
    color: C.text,
    margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5,
      y: 1.06,
      w: 12.2,
      h: 0.34,
      fontFace: FONT,
      fontSize: 12,
      color: C.muted,
      margin: 0,
    });
  }
}

function card(slide, x, y, w, h, title, body, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: opts.fill || C.white },
    line: { color: opts.line || C.border, width: opts.lineWidth || 1 },
    shadow: opts.shadow === false
      ? undefined
      : { type: "outer", color: "000000", opacity: 0.05, blur: 7, angle: 45, distance: 1.5 },
  });
  if (opts.number) {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.2,
      y: y + 0.18,
      w: 0.38,
      h: 0.38,
      fill: { color: opts.numberColor || C.accent },
      line: { color: opts.numberColor || C.accent },
    });
    slide.addText(String(opts.number), {
      x: x + 0.2,
      y: y + 0.235,
      w: 0.38,
      h: 0.2,
      fontFace: FONT,
      fontSize: 10,
      color: C.white,
      bold: true,
      align: "center",
      margin: 0,
    });
  }
  slide.addText(title, {
    x: x + (opts.number ? 0.7 : 0.22),
    y: y + 0.16,
    w: w - (opts.number ? 0.9 : 0.44),
    h: 0.34,
    fontFace: FONT,
    fontSize: opts.titleSize || 14,
    bold: true,
    color: opts.titleColor || C.text,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 0.22,
    y: y + 0.57,
    w: w - 0.44,
    h: h - 0.75,
    fontFace: FONT,
    fontSize: opts.bodySize || 11.5,
    color: opts.bodyColor || C.muted,
    valign: "top",
    breakLine: false,
    margin: 0,
  });
}

function bullets(slide, items, opts = {}) {
  slide.addText(
    items.map((item) => ({
      text: item,
      options: { bullet: { indent: 14 }, breakLine: true },
    })),
    {
      x: opts.x ?? 0.5,
      y: opts.y ?? 1.55,
      w: opts.w ?? 5.5,
      h: opts.h ?? 4.9,
      fontFace: FONT,
      fontSize: opts.fontSize ?? 13,
      color: opts.color ?? C.text,
      paraSpaceAfterPt: opts.paraSpaceAfterPt ?? 9,
      breakLine: false,
      valign: "top",
      margin: 0,
    },
  );
}

function screenshot(slide, name, opts = {}) {
  const path = flowShot(name);
  const x = opts.x ?? 6.45;
  const y = opts.y ?? 1.48;
  const w = opts.w ?? 6.38;
  const h = opts.h ?? 4.0;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x - 0.06,
    y: y - 0.06,
    w: w + 0.12,
    h: h + 0.12,
    rectRadius: 0.08,
    fill: { color: C.bg },
    line: { color: C.border, width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.08, blur: 10, angle: 45, distance: 2 },
  });
  if (path) {
    slide.addImage({ path, x, y, w, h });
  } else {
    slide.addText(`Screenshot: ${name}`, {
      x,
      y: y + h / 2 - 0.2,
      w,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      color: C.muted,
      align: "center",
    });
  }
  if (opts.caption) {
    slide.addText(opts.caption, {
      x,
      y: y + h + 0.18,
      w,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9.5,
      color: C.muted2,
      align: "center",
      margin: 0,
    });
  }
}

function arrow(slide, x1, y1, x2, y2, label) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color: C.accent, width: 2, beginArrowType: "none", endArrowType: "triangle" },
  });
  if (label) {
    slide.addText(label, {
      x: Math.min(x1, x2) + Math.abs(x2 - x1) / 2 - 0.65,
      y: Math.min(y1, y2) - 0.3,
      w: 1.3,
      h: 0.22,
      fontFace: FONT,
      fontSize: 9.5,
      color: C.accentStrong,
      bold: true,
      align: "center",
      margin: 0,
    });
  }
}

function pill(slide, text, x, y, w, fill = C.soft, color = C.accentStrong) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.35,
    rectRadius: 0.12,
    fill: { color: fill },
    line: { color: fill },
  });
  slide.addText(text, {
    x,
    y: y + 0.075,
    w,
    h: 0.18,
    fontFace: FONT,
    fontSize: 9.5,
    bold: true,
    color,
    align: "center",
    margin: 0,
  });
}

// 1 — Title
{
  const slide = base(
    "Position this as a focused onboarding for release 0.2.43: task execution and controlled pipeline progression.",
  );
  slide.background = { color: C.dark };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
  const logo = logoPath();
  if (logo) slide.addImage({ path: logo, x: 0.72, y: 1.1, w: 1.35, h: 1.35 });
  slide.addText("YANGO · SALES OPERATIONS", {
    x: 2.35,
    y: 1.25,
    w: 9,
    h: 0.32,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    charSpacing: 3,
    color: C.accent,
    margin: 0,
  });
  slide.addText("My Space Task Hub\n+ Pipeline Stage Gates", {
    x: 2.35,
    y: 1.8,
    w: 9.8,
    h: 1.55,
    fontFace: FONT,
    fontSize: 38,
    bold: true,
    color: C.white,
    breakLine: false,
    margin: 0,
  });
  slide.addText(
    "Onboarding walkthrough — what was implemented from feedback,\nhow every flow works, and what happens behind the scenes.",
    {
      x: 2.35,
      y: 3.55,
      w: 9.5,
      h: 0.9,
      fontFace: FONT,
      fontSize: 16,
      color: "D1D5DB",
      margin: 0,
    },
  );
  pill(slide, "RELEASE 0.2.43", 2.35, 5.0, 1.65, C.accent, C.white);
  pill(slide, "PRODUCTION", 4.18, 5.0, 1.4, C.green, C.white);
  slide.addText("Appli Taxi Oz · Internal onboarding · July 2026", {
    x: 2.35,
    y: 6.55,
    w: 8,
    h: 0.28,
    fontFace: FONT,
    fontSize: 11,
    color: C.muted2,
    margin: 0,
  });
}

// 2 — Feedback checklist
{
  const slide = base("Use this as the feedback-to-delivery checklist. Every item is live in production.");
  footer(slide, 2);
  heading(
    slide,
    "Feedback → delivery",
    "Every requested capability is now connected",
    "Nine implementation areas — one operating flow from task execution to signed-client handover.",
  );
  const items = [
    ["Task schema", "Summary, parent task, append-only events"],
    ["Task API", "Detail, scope=created, auth, events, reassign"],
    ["Task Drawer", "One editor in My Space and Lead Tasks"],
    ["Created by Me", "Creator-centric workload visibility"],
    ["Lead fields", "Pricing, amount, contract, Corp Client ID"],
    ["Stage service", "Server preflight + structured 422"],
    ["Gate modal", "Only missing fields are requested"],
    ["Signed handover", "Onboard Client + First Client Call"],
    ["EN / HE + tests", "Localized UI, gate tests, production build"],
  ];
  items.forEach(([title, body], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    card(slide, 0.5 + col * 4.12, 1.58 + row * 1.72, 3.82, 1.42, title, body, {
      number: index + 1,
      titleSize: 13,
      bodySize: 10.5,
      fill: index === 8 ? C.greenSoft : C.white,
      line: index === 8 ? "A7F3D0" : C.border,
      numberColor: index === 8 ? C.green : C.accent,
    });
  });
}

// 3 — Architecture
{
  const slide = base("Explain the two related but separate flows: task execution and pipeline control.");
  footer(slide, 3);
  heading(
    slide,
    "Architecture",
    "Two workflows, one source of truth",
    "My Space manages execution. Pipeline gates protect data quality and handover readiness.",
  );

  card(slide, 0.5, 1.55, 5.85, 4.9, "MY SPACE · TASK EXECUTION", "", {
    fill: C.bg,
    shadow: false,
    titleColor: C.accent,
  });
  const my = [
    ["Tabs", "My Tasks · Assigned · Created by Me"],
    ["Task list", "Due buckets, status, owner, lead"],
    ["Task Drawer", "Edit · Summary · Timeline"],
    ["Actions", "Reassign · Create follow-up"],
  ];
  my.forEach(([title, body], i) => {
    card(slide, 0.82, 2.12 + i * 0.98, 5.2, 0.78, title, body, {
      shadow: false,
      titleSize: 12,
      bodySize: 10,
      fill: C.white,
    });
    if (i < my.length - 1) arrow(slide, 3.42, 2.91 + i * 0.98, 3.42, 3.08 + i * 0.98);
  });

  card(slide, 6.75, 1.55, 6.08, 4.9, "PIPELINE · CONTROLLED PROGRESSION", "", {
    fill: C.bg,
    shadow: false,
    titleColor: C.accent,
  });
  const pipeline = [
    ["Move requested", "Drag/drop or status change in lead drawer"],
    ["Server preflight", "Load lead + contacts · evaluate gate matrix"],
    ["Missing?", "Structured 422 → Stage Gate modal"],
    ["Confirm", "Patch fields + status + stage side effects"],
  ];
  pipeline.forEach(([title, body], i) => {
    card(slide, 7.08, 2.12 + i * 0.98, 5.42, 0.78, title, body, {
      shadow: false,
      titleSize: 12,
      bodySize: 10,
      fill: C.white,
    });
    if (i < pipeline.length - 1) arrow(slide, 9.79, 2.91 + i * 0.98, 9.79, 3.08 + i * 0.98);
  });
}

// 4 — My Space
{
  const slide = base("Show where the new task hub lives and explain personal vs shared task visibility.");
  footer(slide, 4);
  heading(
    slide,
    "My Space",
    "A single daily workspace for every kind of work",
    "Personal work stays private. Lead-linked work is collaborative and auditable.",
  );
  bullets(
    slide,
    [
      "My Tasks — private standalone tasks for the signed-in user.",
      "Assigned — lead tasks currently assigned to you.",
      "Created by Me — lead tasks you created, even when owned by somebody else.",
      "Notes — private personal notes; the privacy hint only appears on personal tabs.",
      "Scorecard — your KPI actuals versus targets.",
    ],
    { x: 0.55, y: 1.65, w: 5.2, h: 4.6, fontSize: 12.5 },
  );
  screenshot(slide, "01-my-space-overview", {
    x: 6.02,
    y: 1.58,
    w: 6.78,
    h: 4.24,
    caption: "My Space · all five work contexts in one tab set",
  });
  card(
    slide,
    6.02,
    6.05,
    6.78,
    0.65,
    "PRIVACY RULE",
    "“Private to you” applies only to personal tasks and notes — not lead-linked Assigned / Created by Me work.",
    { fill: C.soft, shadow: false, titleSize: 10.5, bodySize: 9.8, titleColor: C.accentStrong },
  );
}

// 5 — Created by Me
{
  const slide = base("Created by Me gives task creators ownership visibility after delegation.");
  footer(slide, 5);
  heading(
    slide,
    "Created by Me",
    "Delegate work without losing visibility",
    "The creator can reopen, review, reassign and follow up from the same list.",
  );
  screenshot(slide, "06-created-by-me", {
    x: 0.55,
    y: 1.55,
    w: 7.25,
    h: 4.53,
    caption: "Creator scope is driven by sales_tasks.created_by_user_id",
  });
  const steps = [
    ["1", "Create", "A lead task stores both creator and assignee."],
    ["2", "Delegate", "The task moves to the assignee’s Assigned tab."],
    ["3", "Track", "The creator still sees it in Created by Me."],
    ["4", "Act", "Open the Drawer to update, reassign or create follow-up."],
  ];
  steps.forEach(([n, title, body], i) => {
    card(slide, 8.15, 1.55 + i * 1.18, 4.65, 0.96, title, body, {
      number: n,
      shadow: false,
      titleSize: 12.5,
      bodySize: 10.3,
      fill: i % 2 === 0 ? C.bg : C.white,
    });
  });
}

// 6 — Drawer
{
  const slide = base("This is the central task editor reused in both My Space and Lead Tasks.");
  footer(slide, 6);
  heading(
    slide,
    "Task Drawer",
    "One task editor everywhere",
    "Opening a task keeps the user in context — no separate page and no duplicate editor.",
  );
  bullets(
    slide,
    [
      "Editable: title, status, priority, due date, type and description.",
      "Result Summary records the outcome, not just task completion.",
      "Timeline is append-only: created, status, reassignment, due, summary and follow-up events.",
      "Deep link opens the linked lead in Pipeline.",
      "Personal tasks use the same Drawer pattern, without collaboration actions.",
    ],
    { x: 0.55, y: 1.62, w: 4.55, h: 4.9, fontSize: 12.2 },
  );
  screenshot(slide, "03-task-detail-drawer", {
    x: 5.35,
    y: 1.52,
    w: 7.45,
    h: 4.66,
    caption: "Lead task Drawer · result summary and timeline are part of the task record",
  });
}

// 7 — Reassign
{
  const slide = base("Reassignment is an auditable handoff, not a silent owner field update.");
  footer(slide, 7);
  heading(
    slide,
    "Reassign",
    "A controlled handoff with context",
    "Assignee, due date and handoff comment are captured in one action.",
  );
  screenshot(slide, "04-reassign-modal", {
    x: 0.55,
    y: 1.55,
    w: 7.35,
    h: 4.59,
    caption: "Reassign modal appears over the task Drawer",
  });
  bullets(
    slide,
    [
      "Select the new assignee.",
      "Adjust the due date when responsibility changes.",
      "Add a handoff comment so the new owner knows why.",
      "A reassigned event is appended to sales_task_events.",
      "The new owner receives an in-app task_assigned notification.",
      "Object-level authorization allows assignee, creator, lead owner or Admin.",
    ],
    { x: 8.2, y: 1.72, w: 4.55, h: 4.6, fontSize: 11.7 },
  );
}

// 8 — Follow-up
{
  const slide = base("Follow-up creates a linked task chain instead of losing context in a new standalone task.");
  footer(slide, 8);
  heading(
    slide,
    "Follow-up",
    "Turn every outcome into the next action",
    "A follow-up task remains connected to its parent through parent_task_id.",
  );
  bullets(
    slide,
    [
      "Default title: “Follow-up with client”.",
      "Set description, due date and assignee.",
      "The new task is created on the same lead.",
      "The parent receives a follow_up_created timeline event.",
      "The Drawer can show the complete follow-up chain.",
      "The assignee receives the standard task assignment notification.",
    ],
    { x: 0.55, y: 1.66, w: 4.6, h: 4.7, fontSize: 12 },
  );
  screenshot(slide, "05-follow-up-modal", {
    x: 5.38,
    y: 1.55,
    w: 7.42,
    h: 4.64,
    caption: "Follow-up is created without leaving the current task context",
  });
}

// 9 — Task data model
{
  const slide = base("Explain why the task hub has durable history and traceable follow-up chains.");
  footer(slide, 9);
  heading(
    slide,
    "Task data model",
    "Durable outcomes, history and task chains",
    "The original sales_tasks model was extended without breaking existing task APIs.",
  );
  card(slide, 0.55, 1.58, 3.6, 4.8, "sales_tasks", "Existing task record\n\n+ result_summary\n+ parent_task_id → sales_tasks.id\n\nExisting fields retained:\nlead_id · status · priority · due_at · assignee · creator", {
    fill: C.soft,
    line: "FFCACA",
    titleColor: C.accentStrong,
    bodySize: 12,
  });
  card(slide, 5.0, 1.58, 3.85, 4.8, "sales_task_events", "Append-only event stream\n\ncreated\nstatus_changed\nreassigned\ndue_changed\nsummary_updated\nfollow_up_created\ncomment\n\nEach event stores actor, body, changes and timestamp.", {
    fill: C.bg,
    titleColor: C.text,
    bodySize: 11.5,
  });
  card(slide, 9.7, 1.58, 3.08, 4.8, "Indexes", "created_by_user_id\n+ status + due_at\n\nparent_task_id\n\nFast creator views and follow-up-chain lookups.", {
    fill: C.blueSoft,
    line: "BFDBFE",
    titleColor: C.blue,
    bodySize: 12,
  });
  arrow(slide, 4.15, 3.65, 5.0, 3.65, "events");
  arrow(slide, 8.85, 3.65, 9.7, 3.65, "query");
}

// 10 — Pipeline behavior
{
  const slide = base("The key UX change is that the board does not pretend a move succeeded before the server validates it.");
  footer(slide, 10);
  heading(
    slide,
    "Pipeline",
    "No optimistic move — the server decides",
    "The card stays in its current column until validation and persistence succeed.",
  );
  screenshot(slide, "07-pipeline", {
    x: 0.55,
    y: 1.55,
    w: 7.25,
    h: 4.53,
    caption: "Pipeline remains stable while the server evaluates the target stage",
  });
  const steps = [
    ["1", "User requests a move", "Drag/drop or lead Drawer status change."],
    ["2", "Preflight", "POST /leads/[id]/transition with preflightOnly."],
    ["3", "Decision", "Success → move. Missing → structured requirements."],
    ["4", "Confirm", "Modal submits fields + transition in one operation."],
  ];
  steps.forEach(([n, title, body], i) => {
    card(slide, 8.12, 1.55 + i * 1.18, 4.68, 0.96, title, body, {
      number: n,
      shadow: false,
      titleSize: 12.5,
      bodySize: 10.2,
      fill: i === 2 ? C.amberSoft : C.white,
      line: i === 2 ? "FDE68A" : C.border,
      numberColor: i === 2 ? C.amber : C.accent,
    });
  });
}

// 11 — Commercial fields
{
  const slide = base("These fields can be entered in the lead Overview or requested by a stage gate.");
  footer(slide, 11);
  heading(
    slide,
    "Lead workspace",
    "Commercial data now lives on the lead",
    "The fields are staged before conversion and copied into the signed-client flow where relevant.",
  );
  bullets(
    slide,
    [
      "Pricing / proposal — text sent to the client; required for Proposal Sent.",
      "Proposal amount — optional numeric value for future analytics.",
      "Contract number — one of the accepted signing identifiers.",
      "Corp Client ID — alternative signing identifier and B2B linkage seed.",
      "Monthly potential remains the forecast input and is required for forward progression.",
    ],
    { x: 0.55, y: 1.65, w: 4.55, h: 4.7, fontSize: 12.2 },
  );
  screenshot(slide, "08-lead-overview-commercial-fields", {
    x: 5.35,
    y: 1.52,
    w: 7.45,
    h: 4.66,
    caption: "Lead Overview · commercial fields are editable before the transition",
  });
}

// 12 — Matrix
{
  const slide = base("Walk the matrix top to bottom. Gates accumulate on forward skips.");
  footer(slide, 12);
  heading(
    slide,
    "Gate matrix",
    "Requirements by forward transition",
    "Backward moves and Rejected do not use commercial gates. Signed remains terminal.",
  );
  slide.addTable(
    [
      [
        { text: "Transition", options: { bold: true, color: C.white, fill: C.accent } },
        { text: "Required before move", options: { bold: true, color: C.white, fill: C.accent } },
        { text: "Why", options: { bold: true, color: C.white, fill: C.accent } },
      ],
      [
        "New → In Progress",
        "Active contact: name + email or phone\nMonthly potential > 0",
        "A workable lead with forecast value",
      ],
      [
        "In Progress → Proposal Sent",
        "Non-empty Pricing / proposal",
        "Proof that the commercial offer exists",
      ],
      [
        "Proposal Sent → Negotiation",
        "Open follow-up task created in the transition",
        "Negotiation always has a scheduled next step",
      ],
      [
        "Negotiation → Signed",
        "Contract number OR Corp Client ID\n+ selected Account Manager",
        "A signed deal is ready for handover",
      ],
    ],
    {
      x: 0.55,
      y: 1.58,
      w: 12.25,
      h: 4.6,
      colW: [2.65, 5.45, 4.15],
      rowH: [0.5, 0.95, 0.95, 0.95, 1.05],
      border: { pt: 0.7, color: C.border },
      fontFace: FONT,
      fontSize: 11.5,
      color: C.text,
      valign: "mid",
      margin: 0.12,
      fill: C.white,
    },
  );
  pill(slide, "FORWARD SKIPS ACCUMULATE REQUIREMENTS", 0.55, 6.38, 3.2, C.amberSoft, C.amber);
  pill(slide, "BACKWARD / REJECTED: NO COMMERCIAL GATES", 3.95, 6.38, 3.55, C.bg, C.muted);
  pill(slide, "SIGNED: TERMINAL", 7.7, 6.38, 1.65, C.greenSoft, C.green);
}

// 13 — Gate modal
{
  const slide = base("This screenshot shows a Proposal Sent → Negotiation gate with accumulated missing fields.");
  footer(slide, 13);
  heading(
    slide,
    "Stage Gate modal",
    "Ask only for what is missing",
    "The response is structured — each missing requirement becomes a chip and an inline field.",
  );
  screenshot(slide, "09-stage-gate-modal", {
    x: 0.55,
    y: 1.5,
    w: 7.45,
    h: 4.66,
    caption: "Example: Negotiation requires potential, proposal and a follow-up task",
  });
  bullets(
    slide,
    [
      "Missing chips make the reason for blocking explicit.",
      "Inline fields are rendered only for missing requirements.",
      "Negotiation embeds follow-up title, due date, description and assignee.",
      "Signed embeds contract / Corp Client ID plus Account Manager.",
      "Confirm sends fields and stage payload to the transition service.",
      "Cancel leaves the lead untouched in its original column.",
    ],
    { x: 8.3, y: 1.68, w: 4.45, h: 4.65, fontSize: 11.7 },
  );
}

// 14 — Signed orchestration
{
  const slide = base("Signing is not just a status update — it is a cross-team handover workflow.");
  footer(slide, 14);
  heading(
    slide,
    "Signed handover",
    "From negotiation to an owned client relationship",
    "The transition finalizes CRM conversion and creates the first two post-sale responsibilities.",
  );
  const nodes = [
    { x: 0.55, title: "Gate input", body: "Contract # OR Corp Client ID\n+ Account Manager", fill: C.amberSoft },
    { x: 3.15, title: "Signed", body: "Lead status persisted\nAudit + activity", fill: C.soft },
    { x: 5.75, title: "Client conversion", body: "Create / update client\nCopy Corp Client ID", fill: C.bg },
    { x: 8.35, title: "Onboard Client", body: "High-priority task\nSales owner / signer", fill: C.blueSoft },
    { x: 10.95, title: "First Client Call", body: "Assigned to selected AM\nDue in ~2 days", fill: C.greenSoft },
  ];
  nodes.forEach((node, i) => {
    card(slide, node.x, 2.05, 2.15, 2.45, node.title, node.body, {
      number: i + 1,
      fill: node.fill,
      shadow: false,
      titleSize: 12,
      bodySize: 10.5,
      numberColor: i === 4 ? C.green : C.accent,
    });
    if (i < nodes.length - 1) arrow(slide, node.x + 2.15, 3.27, nodes[i + 1].x, 3.27);
  });
  card(
    slide,
    1.7,
    5.15,
    9.95,
    1.05,
    "NO DUPLICATE ONBOARDING TASKS",
    "The previous generic onboarding task was aligned to “Onboard Client”; conversion creates it once, while the transition service adds only “First Client Call” for the selected Account Manager.",
    { fill: C.greenSoft, line: "A7F3D0", shadow: false, titleColor: C.green, bodySize: 10.8 },
  );
}

// 15 — API + security
{
  const slide = base("Summarize the backend contracts and object-level task authorization.");
  footer(slide, 15);
  heading(
    slide,
    "Backend contracts",
    "APIs designed around explicit operations",
    "The server owns validation, authorization, history and side effects.",
  );
  const apis = [
    ["GET /tasks?scope=created", "Tasks created by the signed-in user"],
    ["GET /tasks/[id]", "Detail + events + follow-up chain"],
    ["PATCH /tasks/[id]", "Edit, summary, status or reassign"],
    ["POST /tasks/[id]/follow-up", "Create linked follow-up task"],
    ["POST /leads/[id]/transition", "Preflight or execute a stage transition"],
  ];
  apis.forEach(([name, body], i) => {
    card(slide, 0.55, 1.55 + i * 0.94, 6.0, 0.76, name, body, {
      shadow: false,
      titleSize: 11.5,
      bodySize: 9.8,
      fill: i % 2 === 0 ? C.bg : C.white,
    });
  });
  card(
    slide,
    6.9,
    1.55,
    5.9,
    2.05,
    "Task object authorization",
    "Allowed when the user is:\n• task assignee\n• task creator\n• linked lead owner\n• Admin\n\nPage-level salesPipeline access is still required first.",
    { fill: C.soft, line: "FFCACA", titleColor: C.accentStrong, bodySize: 11.2 },
  );
  card(
    slide,
    6.9,
    3.85,
    5.9,
    2.4,
    "Structured gate error",
    'HTTP 422 · code: "STAGE_REQUIREMENTS"\n\nmissing: [\n  { key: "pricingProposal",\n    label: "Pricing / proposal sent to client" }\n]\n\nThe client renders the modal from this response.',
    { fill: C.dark, line: C.dark, titleColor: C.white, bodyColor: "D1D5DB", bodySize: 10.5 },
  );
}

// 16 — Onboarding checklist
{
  const slide = base("End the walkthrough with the practical day-to-day behavior expected from managers.");
  footer(slide, 16);
  heading(
    slide,
    "Operating playbook",
    "How the team should use the new flow",
    "A short checklist for Sales Managers, Account Managers and Admins.",
  );
  const columns = [
    {
      title: "Sales / Account Manager",
      fill: C.soft,
      items:
        "1. Start the day in My Space.\n2. Review Assigned and overdue work.\n3. Use Result Summary when closing a task.\n4. Create a follow-up instead of an unlinked reminder.\n5. Complete gate fields when moving deals forward.",
    },
    {
      title: "Task creator / delegator",
      fill: C.blueSoft,
      items:
        "1. Open Created by Me.\n2. Check ownership and due dates.\n3. Reassign with a clear comment.\n4. Review the timeline before escalation.\n5. Open the linked lead for deal context.",
    },
    {
      title: "Admin / owner",
      fill: C.greenSoft,
      items:
        "1. Keep users and roles accurate.\n2. Monitor stage data quality.\n3. Verify signed clients have an AM.\n4. Ensure notifications are reviewed.\n5. Use analytics after commercial fields are consistently populated.",
    },
  ];
  columns.forEach((column, i) => {
    card(slide, 0.55 + i * 4.12, 1.58, 3.82, 4.95, column.title, column.items, {
      fill: column.fill,
      shadow: false,
      titleSize: 14,
      bodySize: 12,
      titleColor: i === 2 ? C.green : i === 1 ? C.blue : C.accentStrong,
    });
  });
}

// 17 — Close
{
  const slide = base("Close on the operational outcome: fewer lost follow-ups and cleaner stage progression.");
  slide.background = { color: C.dark };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
  slide.addText("THE RESULT", {
    x: 0.75,
    y: 0.85,
    w: 4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    charSpacing: 2.5,
    color: C.accent,
    margin: 0,
  });
  slide.addText("Every deal has a next action.\nEvery stage has proof.", {
    x: 0.75,
    y: 1.35,
    w: 11.4,
    h: 1.35,
    fontFace: FONT,
    fontSize: 36,
    bold: true,
    color: C.white,
    margin: 0,
  });
  const outcomes = [
    ["Execution", "My Space centralizes personal, assigned and delegated work."],
    ["Accountability", "Task events, summaries and follow-up chains preserve context."],
    ["Data quality", "Stage gates require the information needed for the next phase."],
    ["Handover", "Signing creates an owned client and the first AM action."],
  ];
  outcomes.forEach(([title, body], i) => {
    const x = 0.75 + i * 3.05;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 3.35,
      w: 2.72,
      h: 1.8,
      rectRadius: 0.08,
      fill: { color: "1C1F25", transparency: 0 },
      line: { color: "343841", width: 1 },
    });
    slide.addText(title, {
      x: x + 0.2,
      y: 3.62,
      w: 2.32,
      h: 0.3,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: C.accent,
      margin: 0,
    });
    slide.addText(body, {
      x: x + 0.2,
      y: 4.08,
      w: 2.32,
      h: 0.78,
      fontFace: FONT,
      fontSize: 11,
      color: "D1D5DB",
      margin: 0,
      valign: "top",
    });
  });
  slide.addText("Live in production · https://applitaxi.space", {
    x: 0.75,
    y: 6.45,
    w: 6.5,
    h: 0.32,
    fontFace: FONT,
    fontSize: 12,
    color: C.muted2,
    margin: 0,
  });
}

await pptx.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT}`);
console.log(`Slides: ${pptx._slides?.length ?? TOTAL}`);
