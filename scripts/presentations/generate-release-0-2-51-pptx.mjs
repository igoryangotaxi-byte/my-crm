/**
 * Release 0.2.51 deck: useful 3D Office (Attention / My Desk / Team).
 * Usage: node scripts/presentations/generate-release-0-2-51-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-51");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-3D-Office-Useful-0-2-51.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-3D-Office-Useful-0-2-51.pptx",
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
const TOTAL = 10;

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
pptx.subject = "Release 0.2.51 — Useful 3D Office";
pptx.title = "Yango Sales Operations — Useful 3D Office (0.2.51)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.51 · Confidential", {
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
  s.addText("RELEASE 0.2.51", {
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
  s.addText("3D Office that\nactually helps sales", {
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
    "Attention queue · My Desk · Team floor · stage-gate Advance — live CRM, not decoration",
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
    "What shipped in 0.2.51",
    "From decorative 3D scene → command center + personal desk",
  );
  const items = [
    ["01", "Attention dock", "Overdue tasks, unassigned new, stuck deals, unread, meetings next 2h"],
    ["02", "My Desk", "Leads & tasks filtered by current userId — Advance / Done / Open"],
    ["03", "Team floor", "Real CRM managers with severity cues — click → their deals"],
    ["04", "Pipeline Wall", "Age badges + Advance with the same stage-gate as classic"],
    ["05", "Ask Ops", "Short commands open dock / classic pages (no OpenClaw)"],
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

// 3 Pattern
{
  const s = base();
  heading(
    s,
    "Product",
    "CRM state → spatial cues → fast act",
    "Same pattern as Claw3D — our system of record stays Sales Operation APIs",
  );
  const cards = [
    ["Live state", "Snapshot: leads, tasks, meetings, notifications, managers roster", "blue"],
    ["Spatial cues", "Red/amber pulse on managers · stickers with days-in-stage", "amber"],
    ["Fast act", "Complete · Assign me · Advance (+ stage gate) · Open lead drawer", "green"],
    ["Deep link", "Calendar, Analytics, Discovery, full Pipeline when you need depth", "violet"],
  ];
  cards.forEach((c, i) => {
    const x = 0.5 + (i % 2) * 6.3;
    const y = 1.6 + Math.floor(i / 2) * 2.4;
    const fill =
      c[2] === "blue"
        ? C.blueSoft
        : c[2] === "amber"
          ? C.amberSoft
          : c[2] === "green"
            ? C.greenSoft
            : C.violetSoft;
    const accent =
      c[2] === "blue" ? C.blue : c[2] === "amber" ? C.amber : c[2] === "green" ? C.green : C.violet;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 6.0,
      h: 2.15,
      fill: { color: fill },
      line: { color: C.border },
      rectRadius: 0.12,
    });
    s.addText(c[0], {
      x: x + 0.28,
      y: y + 0.35,
      w: 5.4,
      h: 0.4,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: accent,
    });
    s.addText(c[1], {
      x: x + 0.28,
      y: y + 0.9,
      w: 5.4,
      h: 0.9,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
    });
  });
  footer(s, 3);
}

// 4 Attention screenshot
{
  const s = base();
  heading(
    s,
    "Attention",
    "What hurts right now",
    "Dock opens on load — act without leaving 3D Office",
  );
  addShot(s, "01-attention-dock", 0.5, 1.55, 12.3, 5.3);
  footer(s, 4);
}

// 5 My Desk
{
  const s = base();
  heading(
    s,
    "My Desk",
    "Your open leads & tasks",
    "Filter by assignedManagerUserId — not name substring",
  );
  addShot(s, "02-my-desk", 0.5, 1.55, 12.3, 5.3);
  footer(s, 5);
}

// 6 Team
{
  const s = base();
  heading(
    s,
    "Team",
    "Real CRM managers on the floor",
    "Roster from /office/roster + lead owners · severity critical / warn / ok",
  );
  addShot(s, "03-team-dock", 0.5, 1.55, 12.3, 5.3);
  footer(s, 6);
}

// 7 Pipeline + managers
{
  const s = base();
  heading(
    s,
    "Pipeline Wall",
    "Spatial scan + stage-gate Advance",
    "Stickers sync with dock filters (My / Stuck / Owner)",
  );
  addShot(s, "04-pipeline-wall", 0.4, 1.55, 6.2, 5.3);
  addShot(s, "05-sales-managers", 6.8, 1.55, 6.1, 5.3);
  footer(s, 7);
}

// 8 Ask Ops
{
  const s = base();
  heading(
    s,
    "Ask Ops",
    "Short commands → dock or classic",
    "Try: overdue · stuck · my leads · team · pipeline · calendar",
  );
  addShot(s, "06-ask-ops", 0.5, 1.55, 12.3, 5.3);
  footer(s, 8);
}

// 9 Classic stay
{
  const s = base();
  heading(
    s,
    "Classic",
    "3D for pulse · Classic for depth",
    "Gates, email/SMS, Tracker, Discovery config, search stay in classic UI",
  );
  addShot(s, "07-classic-toggle", 0.5, 1.55, 12.3, 5.3);
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
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
  s.addText("Try it live", {
    x: 0.7,
    y: 2.4,
    w: 11,
    h: 0.5,
    fontFace: FONT,
    fontSize: 18,
    bold: true,
    color: C.accent,
  });
  s.addText("applitaxi.space/sales-operation/office", {
    x: 0.7,
    y: 3.0,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: C.white,
  });
  s.addText(
    "Close the dock anytime · reopen from the chip · managers walk with real load badges",
    {
      x: 0.7,
      y: 4.0,
      w: 11.5,
      h: 0.5,
      fontFace: FONT,
      fontSize: 15,
      color: "B8BFC9",
    },
  );
  s.addText("Release 0.2.51 · Yango Sales Operations", {
    x: 0.7,
    y: 6.7,
    w: 11,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    color: C.muted2,
  });
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log(`Wrote ${OUT_REPO}`);
console.log(`Copied ${OUT_DESKTOP}`);
