/**
 * Release 0.2.62 deck: Orders Live + Pre-Orders polish.
 * Usage: node scripts/presentations/generate-release-0-2-62-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Orders-Live-0-2-62.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Orders-Live-0-2-62.pptx",
);

const C = {
  accent: "FF2D2D",
  text: "14161A",
  muted: "6B7280",
  muted2: "8A919E",
  white: "FFFFFF",
  soft: "FFF1F1",
  green: "059669",
  greenSoft: "ECFDF5",
  amberSoft: "FFFBEB",
  amber: "D97706",
};

const FONT = "Arial";

function logoPath() {
  const path = join(ASSETS, "yango-logo.png");
  return existsSync(path) ? path : null;
}

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.company = "Appli Taxi Oz";
pptx.subject = "Release 0.2.62 — Orders Live + Pre-Orders polish";
pptx.title = "Yango Sales Operations — Orders Live (0.2.62)";
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

function footer(slide, page, total = 4) {
  slide.addText("Yango · Sales Operations · Release 0.2.62 · Confidential", {
    x: 0.5,
    y: 7.16,
    w: 10.5,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted2,
  });
  slide.addText(`${page} / ${total}`, {
    x: 11.5,
    y: 7.16,
    w: 1.3,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted2,
    align: "right",
  });
}

{
  const s = base("Title");
  const logo = logoPath();
  if (logo) s.addImage({ path: logo, x: 0.55, y: 0.4, w: 1.1, h: 0.4 });
  s.addText("RELEASE 0.2.62", {
    x: 0.55,
    y: 2.2,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
    bold: true,
  });
  s.addText("Orders Live + Pre-Orders polish", {
    x: 0.55,
    y: 2.65,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 32,
    color: C.text,
    bold: true,
  });
  s.addText(
    "Clear Completed / In progress / Canceled buckets, live refresh, SO styling.",
    {
      x: 0.55,
      y: 3.45,
      w: 11,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      color: C.muted,
    },
  );
  footer(s, 1);
}

{
  const s = base("Orders");
  s.addText("Orders", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 28,
    color: C.text,
    bold: true,
  });
  const cards = [
    {
      title: "Status clarity",
      body: "transporting_finished → Completed. waiting / pickup / driving / transporting → In progress with raw Yango status on the badge.",
    },
    {
      title: "Live board",
      body: "15s poll, Last updated (Asia/Jerusalem), clickable Completed / In progress / Canceled counters and FilterChips.",
    },
    {
      title: "SO style",
      body: "Flat so-cards, red-rail rows by status, no gradient tiles or hover-lift. Same language as Pre-Orders Controller.",
    },
  ];
  cards.forEach((card, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.2,
      w: 3.95,
      h: 4.5,
      fill: { color: C.soft },
      rectRadius: 0.12,
    });
    s.addText(card.title, {
      x: x + 0.25,
      y: 1.45,
      w: 3.45,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      color: C.accent,
      bold: true,
    });
    s.addText(card.body, {
      x: x + 0.25,
      y: 2.05,
      w: 3.45,
      h: 3.3,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
    });
  });
  footer(s, 2);
}

{
  const s = base("Pre-Orders");
  s.addText("Pre-Orders polish", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 28,
    color: C.text,
    bold: true,
  });
  const bullets = [
    "List / On map → SO underline tabs with #FF2D2D rail (no double-border pill)",
    "Assigned / Unassigned / At risk filters (chips + sticky counters)",
    "At risk rows: pale red wash (yellow + red urgency)",
  ];
  bullets.forEach((line, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.3 + i * 1.35,
      w: 12.2,
      h: 1.15,
      fill: { color: "F5F6F8" },
      rectRadius: 0.1,
    });
    s.addText(line, {
      x: 0.8,
      y: 1.6 + i * 1.35,
      w: 11.7,
      h: 0.55,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
    });
  });
  footer(s, 3);
}

{
  const s = base("Verify");
  s.addText("How to verify", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 28,
    color: C.text,
    bold: true,
  });
  s.addText(
    [
      { text: "1. ", options: { breakLine: false } },
      { text: "/sales-operation/orders", options: { bold: true, breakLine: false } },
      {
        text: " — Live badge ticks; filter In progress; finished rides show Completed.",
        options: { breakLine: true },
      },
      { text: "2. ", options: { breakLine: false } },
      { text: "/sales-operation/pre-orders", options: { bold: true, breakLine: false } },
      {
        text: " — At risk / Unassigned filters; pale red rows; List/On map tabs.",
        options: { breakLine: true },
      },
    ],
    {
      x: 0.55,
      y: 1.3,
      w: 12.2,
      h: 2.8,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
      paraSpaceAfter: 14,
    },
  );
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.55,
    y: 4.6,
    w: 12.2,
    h: 1.8,
    fill: { color: C.amberSoft },
    rectRadius: 0.12,
  });
  s.addText("Fleet enrichment still pending Yango API key support (from 0.2.61).", {
    x: 0.85,
    y: 5.2,
    w: 11.6,
    h: 0.6,
    fontFace: FONT,
    fontSize: 15,
    color: C.amber,
    bold: true,
  });
  footer(s, 4);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
console.log("Copied", OUT_DESKTOP);
