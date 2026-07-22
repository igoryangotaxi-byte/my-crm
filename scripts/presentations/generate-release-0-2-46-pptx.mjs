/**
 * Release 0.2.46 onboarding deck: B2B profile + Calendar.
 * Usage: node scripts/presentations/generate-release-0-2-46-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-46");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-B2B-Profile-Calendar-0-2-46.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-B2B-Profile-Calendar-0-2-46.pptx",
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
  violet: "7C3AED",
  violetSoft: "F5F3FF",
  amber: "D97706",
  amberSoft: "FFFBEB",
  blue: "2563EB",
  blueSoft: "EFF6FF",
};

const FONT = "Arial";
const TOTAL = 12;

function shot(name) {
  const path = join(SHOTS, `${name}.png`);
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
pptx.subject = "Release 0.2.46 — B2B Client Profile & Calendar";
pptx.title = "Yango Sales Operations — B2B Profile & Calendar (0.2.46)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.46 · Confidential", {
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
    h: 0.48,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: C.text,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5,
      y: 1.05,
      w: 12.2,
      h: 0.36,
      fontFace: FONT,
      fontSize: 14,
      color: C.muted,
    });
  }
}

function bulletCard(slide, x, y, w, h, title, lines, tone = "soft") {
  const fill = tone === "blue" ? C.blueSoft : tone === "violet" ? C.violetSoft : tone === "amber" ? C.amberSoft : C.soft;
  const accent = tone === "blue" ? C.blue : tone === "violet" ? C.violet : tone === "amber" ? C.amber : C.accent;
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: C.border },
    rectRadius: 0.12,
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.18,
    w: w - 0.4,
    h: 0.32,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: accent,
  });
  slide.addText(lines.map((l) => ({ text: l, options: { breakLine: true } })), {
    x: x + 0.22,
    y: y + 0.55,
    w: w - 0.4,
    h: h - 0.75,
    fontFace: FONT,
    fontSize: 12,
    color: C.text,
    valign: "top",
  });
}

function addShot(slide, name, x, y, w, h) {
  const path = shot(name);
  if (!path) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.1,
    });
    slide.addText("Screenshot pending", {
      x,
      y: y + h / 2 - 0.15,
      w,
      h: 0.3,
      fontFace: FONT,
      fontSize: 12,
      color: C.muted2,
      align: "center",
    });
    return;
  }
  slide.addImage({ path, x, y, w, h, rounding: { tl: 0.08, tr: 0.08, br: 0.08, bl: 0.08 } });
}

// 1 Cover
{
  const s = base("Release overview for Yango leadership.");
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: C.dark },
    line: { color: C.dark },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
  const logo = logoPath();
  if (logo) s.addImage({ path: logo, x: 0.7, y: 0.55, w: 1.6, h: 0.55 });
  s.addText("RELEASE 0.2.46", {
    x: 0.7,
    y: 2.1,
    w: 11,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: C.accent,
    charSpacing: 2,
  });
  s.addText("B2B Client Profile\n& My Space Calendar", {
    x: 0.7,
    y: 2.55,
    w: 11.5,
    h: 1.6,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: C.white,
  });
  s.addText(
    "amoCRM-style client cards · calendar with lead & personal tasks · Google Calendar sync · platform staff pickers",
    {
      x: 0.7,
      y: 4.4,
      w: 11,
      h: 0.6,
      fontFace: FONT,
      fontSize: 16,
      color: "B8BFC9",
    },
  );
  s.addText("Yango · Sales Operations · Appli Taxi Oz", {
    x: 0.7,
    y: 6.7,
    w: 10,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    color: C.muted2,
  });
}

// 2 Agenda
{
  const s = base();
  heading(s, "Agenda", "What shipped in 0.2.46", "Five product surfaces managers will feel immediately");
  const items = [
    ["01", "B2B Overview → profile", "Search + click opens (or creates) a CRM client profile"],
    ["02", "Client profile workspace", "Deal fields, managers, activity feed, Task/Note/Mail/Meeting"],
    ["03", "My Space Calendar", "Sidebar subsection with meetings + assigned lead tasks"],
    ["04", "Event side drawers", "Edit, reschedule, complete, append timestamped notes"],
    ["05", "Staff pickers cleaned", "Only approved platform users (@appli.taxi) in assignee/owner filters"],
  ];
  items.forEach((item, i) => {
    const y = 1.55 + i * 0.95;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y,
      w: 12.3,
      h: 0.82,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.1,
    });
    s.addText(item[0], {
      x: 0.75,
      y: y + 0.22,
      w: 0.7,
      h: 0.4,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: C.accent,
    });
    s.addText(item[1], {
      x: 1.6,
      y: y + 0.12,
      w: 10.8,
      h: 0.32,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: C.text,
    });
    s.addText(item[2], {
      x: 1.6,
      y: y + 0.42,
      w: 10.8,
      h: 0.28,
      fontFace: FONT,
      fontSize: 13,
      color: C.muted,
    });
  });
  footer(s, 2);
}

// 3 B2B overview
{
  const s = base();
  heading(s, "B2B Overview", "Search and open any client into CRM", "No more dead-end metrics-only click");
  addShot(s, "04-b2b-overview", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "How it works",
    [
      "• Filter table by name or corp_client_id",
      "• Click → ensure CRM client",
      "• Missing profile? creates signed lead + sales_clients",
      "• Lands on amoCRM-style profile",
      "• Trips remain a secondary link",
    ],
  );
  footer(s, 3);
}

// 4 Profile
{
  const s = base();
  heading(s, "Client profile", "Left: data · Right: activity", "One place for post-signed client work");
  addShot(s, "05-client-profile", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Left panel",
    [
      "• Contact fields",
      "• Account / Sales managers",
      "• Deal fields from linked lead",
      "  (segment, potential, pricing,",
      "  contract, address, notes…)",
      "• B2B KPI tiles + date range",
    ],
    "violet",
  );
  footer(s, 4);
}

// 5 Composer
{
  const s = base();
  heading(s, "Client profile", "Composer bubbles on the activity feed", "Task · Note · Mail · Meeting — without leaving the card");
  addShot(s, "05-client-profile", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Sync rules",
    [
      "• Task → My Space + Calendar",
      "• Note → My Space notes",
      "• Meeting → Calendar",
      "  (+ Google if connected)",
      "• Mail → lead email thread",
      "• Feed shows chronological history",
    ],
    "blue",
  );
  footer(s, 5);
}

// 6 Calendar overview
{
  const s = base();
  heading(s, "Calendar", "My Space → Calendar in the sidebar", "Meetings, lead tasks, personal tasks — one grid");
  addShot(s, "02-calendar", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Color legend",
    [
      "• Sky — Meetings",
      "• Violet — Lead tasks",
      "  (assigned to you)",
      "• Amber — Personal tasks",
      "",
      "Optional: Connect Google",
      "Calendar to sync meetings",
    ],
    "amber",
  );
  footer(s, 6);
}

// 7 Event drawer
{
  const s = base();
  heading(s, "Calendar", "Click any event → side card", "Edit fields, append notes, complete or delete");
  addShot(s, "03-calendar-event-drawer", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Actions",
    [
      "• Meetings: title, window,",
      "  notes/agenda, delete",
      "• Tasks: status, priority, due,",
      "  description, mark done",
      "• Append timestamped notes",
      "• Open linked client when set",
    ],
    "violet",
  );
  footer(s, 7);
}

// 8 Lead tasks → calendar
{
  const s = base();
  heading(
    s,
    "Pipeline → Calendar",
    "Tasks from the lead card reach the assignee",
    "Create with an assignee + due date → appears on their calendar",
  );
  addShot(s, "08-lead-tasks", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Defaults that help",
    [
      "• Assignee defaults to you",
      "• Due defaults to ~+2 hours",
      "• Only open tasks with due",
      "  dates show on the grid",
      "• Violet chip shows lead name",
    ],
    "blue",
  );
  footer(s, 8);
}

// 9 My Space
{
  const s = base();
  heading(s, "My Space", "Tasks stay in My Space — Calendar is next door", "Sidebar group: Tasks + Calendar");
  addShot(s, "01-myspace-tasks", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Navigation",
    [
      "• My Space ▾",
      "    Tasks",
      "    Calendar",
      "• Old ?tab=calendar redirects",
      "• Badge still shows open work",
    ],
  );
  footer(s, 9);
}

// 10 Staff pickers
{
  const s = base();
  heading(
    s,
    "Access hygiene",
    "Assignees & owners = platform staff only",
    "Approved internal users — no pending, rejected, or client-portal accounts",
  );
  addShot(s, "06-pipeline", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Where it applies",
    [
      "• Lead owner selects",
      "• Pipeline owner filter",
      "• Task assignee",
      "• Reassign / follow-up",
      "• Stage-gate follow-up",
      "• AM/SM role pickers unchanged",
    ],
    "amber",
  );
  footer(s, 10);
}

// 11 Google + ops
{
  const s = base();
  heading(s, "Ops checklist", "What to configure after deploy", "SQL already applied; Google redirect may need a Cloud console update");
  const rows = [
    ["Database", "supabase_sales_client_activity.sql applied (meetings + GCal tokens + personal FKs)"],
    ["Google Calendar", "Add redirect https://applitaxi.space/api/google/calendar/callback"],
    ["Env", "GOOGLE_OAUTH_CLIENT_ID / SECRET (same Workspace OAuth client as SSO is fine)"],
    ["Staff list", "Only @appli.taxi approved users remain as internal platform staff"],
  ];
  rows.forEach((row, i) => {
    const y = 1.6 + i * 1.15;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y,
      w: 12.3,
      h: 1.0,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.1,
    });
    s.addText(row[0], {
      x: 0.75,
      y: y + 0.2,
      w: 2.4,
      h: 0.55,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: C.accent,
      valign: "middle",
    });
    s.addText(row[1], {
      x: 3.3,
      y: y + 0.2,
      w: 9.1,
      h: 0.55,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
      valign: "middle",
    });
  });
  footer(s, 11);
}

// 12 Close
{
  const s = base();
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: C.dark },
    line: { color: C.dark },
  });
  s.addText("Ready for managers", {
    x: 0.7,
    y: 2.4,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 36,
    bold: true,
    color: C.white,
  });
  s.addText(
    "From B2B Overview into a living client profile — and from every assigned task into the calendar.",
    {
      x: 0.7,
      y: 3.3,
      w: 11.5,
      h: 0.8,
      fontFace: FONT,
      fontSize: 18,
      color: "B8BFC9",
    },
  );
  s.addText("applitaxi.space  ·  Sales Operations  ·  0.2.46", {
    x: 0.7,
    y: 6.5,
    w: 11,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
  });
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log(`Wrote ${OUT_REPO}`);
console.log(`Copied to ${OUT_DESKTOP}`);
