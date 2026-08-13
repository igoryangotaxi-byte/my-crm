/**
 * Release 0.2.54 deck: Linear-primary Sales Operation redesign.
 * Usage: node scripts/presentations/generate-release-0-2-54-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "screenshots");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Linear-Redesign-0-2-54.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Linear-Redesign-0-2-54.pptx",
);

const C = {
  accent: "FF2D2D",
  text: "14161A",
  muted: "6B7280",
  muted2: "8A919E",
  bg: "ECEEF2",
  white: "FFFFFF",
  border: "E9EBF0",
  soft: "FFF1F1",
  dark: "0F1115",
  violet: "7C3AED",
  violetSoft: "F5F3FF",
  amber: "D97706",
  amberSoft: "FFFBEB",
  blue: "2563EB",
  blueSoft: "EFF6FF",
  green: "059669",
  greenSoft: "ECFDF5",
};

const FONT = "Arial";
const TOTAL = 10;

function shot(name) {
  const path = join(SHOTS, `${name}.png`);
  return existsSync(path) ? path : null;
}

function logoPath() {
  const appli = join(ROOT, "public/brand/appli-logo.png");
  if (existsSync(appli)) return appli;
  const yango = join(ASSETS, "yango-logo.png");
  return existsSync(yango) ? yango : null;
}

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.company = "Appli Taxi Oz";
pptx.subject = "Release 0.2.54 — Linear-primary Sales Operation redesign";
pptx.title = "Yango Sales Operations — Linear Redesign (0.2.54)";
pptx.lang = "en-US";
pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: "en-US" };

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
  slide.addText("Yango · Sales Operations · Release 0.2.54 · Confidential", {
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
          : tone === "green"
            ? C.greenSoft
            : C.soft;
  const accent =
    tone === "blue"
      ? C.blue
      : tone === "violet"
        ? C.violet
        : tone === "amber"
          ? C.amber
          : tone === "green"
            ? C.green
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
  const s = base();
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
  if (logo) s.addImage({ path: logo, x: 0.7, y: 0.5, w: 0.7, h: 0.7 });
  s.addText("RELEASE 0.2.54", {
    x: 0.7,
    y: 2.0,
    w: 11,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: C.accent,
    charSpacing: 2,
  });
  s.addText("Linear-primary Sales Operation\nredesign", {
    x: 0.7,
    y: 2.45,
    w: 11.5,
    h: 1.7,
    fontFace: FONT,
    fontSize: 36,
    bold: true,
    color: C.white,
  });
  s.addText(
    "Inset canvas · Appli mark · Yango fonts · presentation only — flows unchanged",
    {
      x: 0.7,
      y: 4.45,
      w: 11.5,
      h: 0.55,
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
  heading(
    s,
    "Agenda",
    "What shipped in 0.2.54",
    "Visual system only. APIs, RBAC, validations and integrations stay as they were.",
  );
  const items = [
    ["01", "Inset canvas shell", "Grey workspace, white rounded canvas, 2px Yango active nav rail"],
    ["02", "Appli mark + Yango type", "Sidebar logo from brand file; Text 400/500/700 + Headline 900"],
    ["03", "Flat cards everywhere", "No glass, no hover-lift on Orders, Calculator, Comms, Pre-orders, Access"],
    ["04", "⌘K + density", "Command palette wraps existing search; comfortable / compact toggle"],
    ["05", "Quiet motion", "160ms ease-out drawers, button active 0.97 — no daily-action animation"],
  ];
  items.forEach((item, i) => {
    const y = 1.55 + i * 0.95;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y,
      w: 12.3,
      h: 0.85,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.1,
    });
    s.addText(item[0], {
      x: 0.7,
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
      y: y + 0.14,
      w: 10.8,
      h: 0.32,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: C.text,
    });
    s.addText(item[2], {
      x: 1.6,
      y: y + 0.44,
      w: 10.8,
      h: 0.28,
      fontFace: FONT,
      fontSize: 13,
      color: C.muted,
    });
  });
  footer(s, 2);
}

// 3 Shell
{
  const s = base();
  heading(
    s,
    "Shell",
    "Inset canvas + Appli mark",
    "Sales Operation sits on #eceef2. The product lives in a white 16px canvas.",
  );
  addShot(s, "pipeline", 0.5, 1.55, 8.4, 5.35);
  bulletCard(
    s,
    9.1,
    1.55,
    3.7,
    5.35,
    "Signature",
    [
      "Appli squircle in the sidebar (same 36px slot)",
      "Headline 900 for page H1 only",
      "2px red rail on the active nav item",
      "Density: comfortable or compact",
      "Legacy Main CRM UI is unchanged",
    ],
    "soft",
  );
  footer(s, 3);
}

// 4 Pipeline
{
  const s = base();
  heading(
    s,
    "Pipeline",
    "Board chrome, not a new board",
    "HTML5 drag-and-drop, stage gates and lead cards keep the same logic.",
  );
  addShot(s, "pipeline-lead", 0.5, 1.55, 12.3, 5.35);
  footer(s, 4);
}

// 5 Command + density
{
  const s = base();
  heading(
    s,
    "Navigation",
    "⌘K command palette + density",
    "Same /api/sales-operation/search. Faster jump between pages, leads and clients.",
  );
  bulletCard(
    s,
    0.5,
    1.55,
    6.0,
    5.35,
    "Command palette",
    [
      "⌘K / Ctrl+K from anywhere in SO",
      "Pages, recent search, jump to lead/client",
      "Sentence-case group headings",
      "No open/close animation (Emil rule)",
      "Respects existing RBAC page keys",
    ],
    "blue",
  );
  bulletCard(
    s,
    6.75,
    1.55,
    6.05,
    5.35,
    "Density toggle",
    [
      "Header control: Comfortable / Compact",
      "Persists in localStorage (so-ui-density)",
      "data-density on the SO shell",
      "Tighter rows and paddings in compact",
      "Default stays comfortable",
    ],
    "violet",
  );
  footer(s, 5);
}

// 6 Flattened modules
{
  const s = base();
  heading(
    s,
    "Surfaces",
    "Glass and hover-lift are gone",
    "P0 modules now use the same flat so-card language as Pipeline.",
  );
  addShot(s, "orders", 0.5, 1.55, 4.0, 2.55);
  addShot(s, "price-calculator", 4.65, 1.55, 4.0, 2.55);
  addShot(s, "communications", 8.8, 1.55, 4.0, 2.55);
  addShot(s, "pre-orders", 0.5, 4.25, 4.0, 2.55);
  addShot(s, "lead-discovery", 4.65, 4.25, 4.0, 2.55);
  addShot(s, "accesses", 8.8, 4.25, 4.0, 2.55);
  footer(s, 6);
}

// 7 Analytics / My Space
{
  const s = base();
  heading(
    s,
    "Workspaces",
    "Analytics, My Space, Settings",
    "Same reports and settings. Quieter chrome, sentence-case labels.",
  );
  addShot(s, "analytics", 0.5, 1.55, 6.05, 5.35);
  addShot(s, "my-space", 6.75, 1.55, 6.05, 5.35);
  footer(s, 7);
}

// 8 Motion + type
{
  const s = base();
  heading(
    s,
    "Craft",
    "Type, color, motion",
    "Yango only. No Inter, Geist or Google Fonts. No dark mode.",
  );
  bulletCard(
    s,
    0.5,
    1.55,
    4.0,
    5.35,
    "Typography",
    [
      "Yango Text 400 / 500 / 700",
      "Yango Headline 900 for H1",
      "Sentence case labels (no ALL CAPS)",
      "Section titles stay Text, not Headline",
    ],
    "soft",
  );
  bulletCard(
    s,
    4.7,
    1.55,
    4.0,
    5.35,
    "Color",
    [
      "Accent #FF2D2D only",
      "Workspace #eceef2",
      "Surface #f7f8fa / white canvas",
      "Monday-style status colors only",
    ],
    "amber",
  );
  bulletCard(
    s,
    8.9,
    1.55,
    3.9,
    5.35,
    "Motion",
    [
      "Drawers / modals 160–200ms ease-out",
      "Button :active scale 0.97",
      "No lift on cards or KPI tiles",
      "No animation on daily actions",
    ],
    "green",
  );
  footer(s, 8);
}

// 9 Unchanged
{
  const s = base();
  heading(
    s,
    "Guardrails",
    "What did not change",
    "This release is presentation-only. Do not retrain the team on flows.",
  );
  const rows = [
    ["Pipeline DnD", "Still HTML5 drag-and-drop — not dnd-kit"],
    ["Tracker", "Still @dnd-kit. Same columns, tickets, mentions"],
    ["Automation", "Still React Flow. Node logic unchanged"],
    ["3D Office", "Internals untouched; chrome only"],
    ["APIs / RBAC", "Same routes, permissions and validations"],
    ["Legacy CRM", "app/(crm) left as-is on the backend / old UI"],
  ];
  rows.forEach((row, i) => {
    const y = 1.55 + i * 0.82;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y,
      w: 12.3,
      h: 0.72,
      fill: { color: i % 2 === 0 ? C.bg : C.white },
      line: { color: C.border },
      rectRadius: 0.08,
    });
    s.addText(row[0], {
      x: 0.7,
      y: y + 0.18,
      w: 2.8,
      h: 0.36,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: C.accent,
      valign: "middle",
    });
    s.addText(row[1], {
      x: 3.6,
      y: y + 0.18,
      w: 8.9,
      h: 0.36,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
      valign: "middle",
    });
  });
  footer(s, 9);
}

// 10 Close
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
  s.addText("Same CRM. Calmer product.", {
    x: 0.7,
    y: 2.4,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: C.white,
  });
  s.addText(
    "Inset canvas · Appli mark · flat cards · ⌘K · density · quiet motion.",
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
  s.addText("applitaxi.space  ·  Sales Operations  ·  0.2.54", {
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
try {
  copyFileSync(OUT_REPO, OUT_DESKTOP);
  console.log(`Copied to ${OUT_DESKTOP}`);
} catch (err) {
  console.warn(`Desktop copy skipped: ${err instanceof Error ? err.message : err}`);
}
console.log(`Wrote ${OUT_REPO}`);
