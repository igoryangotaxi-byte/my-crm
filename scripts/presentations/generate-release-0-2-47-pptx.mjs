/**
 * Release 0.2.47 onboarding deck: Sales Operation Tracker.
 * Usage: node scripts/presentations/generate-release-0-2-47-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-47");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Tracker-0-2-47.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Tracker-0-2-47.pptx",
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
const TOTAL = 11;

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
pptx.subject = "Release 0.2.47 — Sales Operation Tracker";
pptx.title = "Yango Sales Operations — Tracker (0.2.47)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.47 · Confidential", {
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
  const fill =
    tone === "blue"
      ? C.blueSoft
      : tone === "violet"
        ? C.violetSoft
        : tone === "amber"
          ? C.amberSoft
          : C.soft;
  const accent =
    tone === "blue"
      ? C.blue
      : tone === "violet"
        ? C.violet
        : tone === "amber"
          ? C.amber
          : C.accent;
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
  slide.addImage({
    path,
    x,
    y,
    w,
    h,
    rounding: { tl: 0.08, tr: 0.08, br: 0.08, bl: 0.08 },
  });
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
  s.addText("RELEASE 0.2.47", {
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
  s.addText("Sales Operation\nTracker", {
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
    "Multi-project kanban · ticket drawer · @mentions · My Space sync · notifications",
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
  heading(s, "Agenda", "What shipped in 0.2.47", "Tracker is the new shared work surface next to Pipeline");
  const items = [
    ["01", "Projects list", "Create boards for team workstreams under /sales-operation/tracker"],
    ["02", "Kanban board", "Configurable columns, WIP limits, drag-and-drop tickets"],
    ["03", "Ticket drawer", "Description, assignees, labels, checklist, links, activity"],
    ["04", "@Mentions", "Autocomplete CRM users → My Space badge + notifications bell"],
    ["05", "My Space + Calendar", "Assigned tickets in Tracker tab; emerald due dates on calendar"],
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

// 3 Projects
{
  const s = base();
  heading(s, "Tracker", "Start from projects — one board per workstream", "Sidebar: Tracker sits with Pipeline and My Space");
  addShot(s, "01-tracker-projects", 0.5, 1.55, 8.2, 5.2);
  bulletCard(s, 9.0, 1.55, 3.8, 5.2, "Managers do", [
    "• Open Tracker in the sidebar",
    "• Create a project (e.g. Launch,",
    "  Partner ops, Hiring)",
    "• Open the board",
    "• Permission: salesTracker",
  ]);
  footer(s, 3);
}

// 4 Board
{
  const s = base();
  heading(s, "Board", "Columns you control — tickets you drag", "Rename, recolor, WIP, reorder, delete columns");
  addShot(s, "02-tracker-board", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Board tools",
    [
      "• Inline create ticket",
      "• Filters + search",
      "• Drag between columns",
      "• Column ⋮ menu",
      "• Copy ticket URL",
    ],
    "violet",
  );
  footer(s, 4);
}

// 5 Drawer
{
  const s = base();
  heading(s, "Ticket", "Side drawer = full work context", "Stay on the board — detail opens without a page jump");
  addShot(s, "03-ticket-drawer", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Inside a ticket",
    [
      "• Markdown description",
      "• Multi-assignees",
      "• Labels + priority + due",
      "• Checklist / subtasks",
      "• Linked tickets",
      "• Activity + archive",
    ],
    "blue",
  );
  footer(s, 5);
}

// 6 Mentions
{
  const s = base();
  heading(s, "@Mentions", "Tag CRM users in comments", "Autocomplete → highlight → My Space + bell");
  addShot(s, "04-mention-composer", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "What the assignee sees",
    [
      "• Red badge on My Space",
      "  Tracker tab",
      "• @mention in notifications",
      "• Highlighted comment text",
      "• Deep link to the ticket",
    ],
    "amber",
  );
  footer(s, 6);
}

// 7 My Space
{
  const s = base();
  heading(s, "My Space", "Assigned Tracker tickets live next to Tasks", "Personal inbox for board work assigned to you");
  addShot(s, "05-myspace-tracker", 0.5, 1.55, 8.2, 5.2);
  bulletCard(s, 9.0, 1.55, 3.8, 5.2, "Sync rules", [
    "• Assignees → My Space Tracker",
    "• Mentions → red tab badge",
    "• Click opens the board ticket",
    "• Separate from sales_tasks",
  ]);
  footer(s, 7);
}

// 8 Calendar
{
  const s = base();
  heading(s, "Calendar", "Tracker due dates on the grid", "Emerald chips = Tracker tickets with a due date");
  addShot(s, "06-calendar", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Color reminder",
    [
      "• Sky — Meetings",
      "• Violet — Lead tasks",
      "• Amber — Personal tasks",
      "• Emerald — Tracker tickets",
    ],
    "blue",
  );
  footer(s, 8);
}

// 9 Where to find it
{
  const s = base();
  heading(s, "Navigation", "Tracker in the Sales Operation sidebar", "Same shell as Pipeline — new page key salesTracker");
  addShot(s, "07-pipeline-sidebar", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Access",
    [
      "• Permissions version 12",
      "• Grant salesTracker in Accesses",
      "• Admins / managers first",
      "• AI automation = later",
    ],
    "violet",
  );
  footer(s, 9);
}

// 10 Ops
{
  const s = base();
  heading(s, "Ops checklist", "Required before first use on prod", "Code is live on applitaxi.space — schema must be applied");
  const rows = [
    ["Database", "Run scripts/sql/supabase_sales_tracker.sql in Supabase (or npm run db:apply:sales-operation with DB URL)"],
    ["Permissions", "Confirm salesTracker page key for roles that should see Tracker"],
    ["Smoke test", "Create project → ticket → assign → @mention → check My Space + bell"],
    ["Version", "App 0.2.47 · commit d43c4d89 · release notes in CRM"],
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
  footer(s, 10);
}

// 11 Close
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
  s.addText("Shared work, finally on a board", {
    x: 0.7,
    y: 2.4,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: C.white,
  });
  s.addText(
    "From Tracker columns into My Space and the calendar — with @mentions that actually reach people.",
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
  s.addText("applitaxi.space  ·  Sales Operations  ·  0.2.47", {
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
