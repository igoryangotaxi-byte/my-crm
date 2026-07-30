/**
 * Release 0.2.50 deck: Appli Taxi CRM unify + 3D Office.
 * Usage: node scripts/presentations/generate-release-0-2-50-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-50");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-CRM-3D-Office-0-2-50.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-CRM-3D-Office-0-2-50.pptx",
);

const C = {
  accent: "FF2D2D",
  text: "14161A",
  muted: "6B7280",
  muted2: "8A919E",
  bg: "F5F6F8",
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
pptx.subject = "Release 0.2.50 — Appli Taxi CRM + 3D Office";
pptx.title = "Yango Sales Operations — Appli Taxi CRM & 3D Office (0.2.50)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.50 · Confidential", {
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
  if (logo) s.addImage({ path: logo, x: 0.7, y: 0.55, w: 1.6, h: 0.55 });
  s.addText("RELEASE 0.2.50", {
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
  s.addText("Appli Taxi CRM\n+ interactive 3D Office", {
    x: 0.7,
    y: 2.45,
    w: 11.5,
    h: 1.7,
    fontFace: FONT,
    fontSize: 38,
    bold: true,
    color: C.white,
  });
  s.addText(
    "One shell for day-to-day sales · walking team agents · live CRM workbench",
    {
      x: 0.7,
      y: 4.4,
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
    "What shipped in 0.2.50",
    "Unified product shell + a spatial way to work the CRM",
  );
  const items = [
    ["01", "Appli Taxi CRM branding", "Sales Operation becomes the product name the team sees every day"],
    ["02", "Tools inside the shell", "Communications, Price Calculator, Access — no more bouncing to Main CRM"],
    ["03", "Staff landing", "Login / OAuth open Sales Operation; Main CRM nav stays empty for staff"],
    ["04", "3D Office", "Rooms, Pipeline Wall, Classic ↔ 3D toggle"],
    ["05", "Team agents + workbench", "Igor K, Lior, Igor R, Itay, Egor, Ido, Adam, Gal — real CRM actions"],
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
      y: y + 0.46,
      w: 10.8,
      h: 0.28,
      fontFace: FONT,
      fontSize: 13,
      color: C.muted,
    });
  });
  footer(s, 2);
}

// 3 Why / product story
{
  const s = base();
  heading(
    s,
    "Why",
    "One CRM surface for the sales floor",
    "Stop context-switching between Main CRM and Sales Operation",
  );
  bulletCard(
    s,
    0.5,
    1.55,
    4,
    5.2,
    "Before",
    [
      "Day-to-day work lived in Sales Operation,",
      "but Communications / Price Calculator /",
      "Access still sat under Main CRM.",
      "",
      "Staff saw two products and two navs.",
      "Onboarding friction for new managers.",
    ],
    "amber",
  );
  bulletCard(
    s,
    4.7,
    1.55,
    4,
    5.2,
    "After 0.2.50",
    [
      "Appli Taxi CRM = Sales Operation shell.",
      "Communications, Price Calculator,",
      "Access under Settings — same chrome.",
      "",
      "Old URLs redirect.",
      "Login lands on Sales Operation.",
    ],
    "green",
  );
  bulletCard(
    s,
    8.9,
    1.55,
    3.9,
    5.2,
    "Plus 3D Office",
    [
      "Optional spatial view of the same CRM.",
      "Agents walk the floor with live badges.",
      "Click → workbench with leads / tasks /",
      "analytics / discovery — no OpenClaw.",
      "",
      "Classic UI always one click away.",
    ],
    "violet",
  );
  footer(s, 3);
}

// 4 Pipeline shell shot
{
  const s = base(
    "Point at the Appli Taxi CRM header/sidebar. Note Classic / 3D toggle if visible in header.",
  );
  heading(
    s,
    "Shell",
    "Pipeline inside Appli Taxi CRM",
    "Same board you know — now under a single product brand",
  );
  addShot(s, "01-pipeline-shell", 0.5, 1.5, 12.3, 5.3);
  footer(s, 4);
}

// 5 Communications
{
  const s = base();
  heading(
    s,
    "Tools",
    "Communications in the CRM shell",
    "/sales-operation/communications · old /communications redirects here",
  );
  addShot(s, "02-communications", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "What to show the team",
    [
      "Sidebar item under Appli Taxi CRM.",
      "Same permissions as before.",
      "",
      "No new messaging backend —",
      "only navigation + shell unify.",
      "",
      "Use this when explaining",
      "“everything lives in one app”.",
    ],
    "blue",
  );
  footer(s, 5);
}

// 6 Price calculator
{
  const s = base();
  heading(
    s,
    "Tools",
    "Price Calculator in the CRM shell",
    "/sales-operation/price-calculator · tariffs & quotes without leaving SO",
  );
  addShot(s, "03-price-calculator", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "Sales floor use",
    [
      "Managers quote while staying",
      "in the pipeline context.",
      "",
      "Shared PriceCalculatorView",
      "component (no logic rewrite).",
      "",
      "Legacy /price-calculator",
      "still redirects.",
    ],
    "violet",
  );
  footer(s, 6);
}

// 7 Access
{
  const s = base();
  heading(
    s,
    "Admin",
    "Access management in Settings",
    "Settings → Access · roles & page permissions for Appli Taxi CRM",
  );
  addShot(s, "04-settings-access", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "For admins",
    [
      "Users, roles, SO page keys.",
      "Extracted AccessManagementView",
      "embedded in Sales Settings.",
      "",
      "Gate: salesSettings || accesses.",
      "",
      "Old /accesses redirects into",
      "Settings with section=access.",
    ],
    "soft",
  );
  footer(s, 7);
}

// 8 3D Office overview
{
  const s = base(
    "Highlight walking agents, room chips, reception HUD stats, Graphics preset.",
  );
  heading(
    s,
    "3D Office",
    "Walk the CRM",
    "/sales-operation/office · rooms · live stats · Classic/3D toggle",
  );
  addShot(s, "05-office-overview", 0.5, 1.5, 12.3, 5.3);
  footer(s, 8);
}

// 9 Pipeline wall
{
  const s = base(
    "Show stickers by stage and Advance on a card — stage move without leaving 3D.",
  );
  heading(
    s,
    "3D Office",
    "Pipeline Wall",
    "Click sticker → lead drawer · Advance → next stage via existing transition API",
  );
  addShot(s, "06-office-pipeline", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "Rooms & filters",
    [
      "Reception · Sales · Pipeline",
      "Calendar · Tasks · Dashboard",
      "Automation / Discovery",
      "",
      "Room chips focus the camera",
      "(zoom stays free after snap).",
      "",
      "Agent quick-filters can pin",
      "new / stuck / owner leads.",
    ],
    "amber",
  );
  footer(s, 9);
}

// 10 Agents + workbench
{
  const s = base(
    "Name the eight agents. Show workbench bottom-left with real actions (Open card, Advance, Done).",
  );
  heading(
    s,
    "Agents",
    "Team on the floor — with real CRM power",
    "Hover · click · workbench panel · live badges from API data",
  );
  addShot(s, "07-office-workbench", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "Who does what",
    [
      "Igor K — briefing, stuck deals",
      "Lior / Igor R / Itay — own leads",
      "Egor — live funnel stats",
      "Ido — tasks · mark Done",
      "Adam — Lead Discovery",
      "Gal — meetings · portfolio",
      "",
      "Data from existing CRM APIs —",
      "no separate agent database.",
    ],
    "green",
  );
  footer(s, 10);
}

// 11 Closing
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
  s.addText("Open in production", {
    x: 0.7,
    y: 2.0,
    w: 11,
    h: 0.45,
    fontFace: FONT,
    fontSize: 18,
    color: C.accent,
    bold: true,
  });
  s.addText("https://applitaxi.space/sales-operation/office", {
    x: 0.7,
    y: 2.55,
    w: 12,
    h: 0.5,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: C.white,
  });
  s.addText("Also: /sales-operation/pipeline · communications · price-calculator · settings?section=access", {
    x: 0.7,
    y: 3.3,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    color: "B8BFC9",
  });
  s.addText("Header → Classic / 3D · Graphics Low / High / Static", {
    x: 0.7,
    y: 4.0,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: "B8BFC9",
  });
  s.addText("Release 0.2.50 · Appli Taxi CRM + 3D Office · Appli Taxi Oz", {
    x: 0.7,
    y: 6.5,
    w: 11,
    h: 0.35,
    fontFace: FONT,
    fontSize: 13,
    color: C.muted2,
  });
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log(`Wrote ${OUT_REPO}`);
console.log(`Copied ${OUT_DESKTOP}`);
