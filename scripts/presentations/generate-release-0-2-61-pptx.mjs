/**
 * Release 0.2.61 deck: Pre-Orders Controller Live.
 * Usage: node scripts/presentations/generate-release-0-2-61-pptx.mjs
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
  "docs/presentations/Yango-Sales-Operations-Pre-Orders-Controller-0-2-61.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Pre-Orders-Controller-0-2-61.pptx",
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
  amber: "D97706",
  amberSoft: "FFFBEB",
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
pptx.subject = "Release 0.2.61 — Pre-Orders Controller Live";
pptx.title = "Yango Sales Operations — Pre-Orders Controller (0.2.61)";
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

function footer(slide, page, total = 5) {
  slide.addText("Yango · Sales Operations · Release 0.2.61 · Confidential", {
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
  s.addText("RELEASE 0.2.61", {
    x: 0.55,
    y: 2.1,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
    bold: true,
  });
  s.addText("Pre-Orders Controller Live", {
    x: 0.55,
    y: 2.55,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 34,
    color: C.text,
    bold: true,
  });
  s.addText(
    "Live board, urgency rail, Driver confirmed marks — for HUB operators.",
    {
      x: 0.55,
      y: 3.35,
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
  const s = base("Shipped");
  s.addText("What shipped", {
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
      title: "Live feed",
      body: "Uncached /live API, poll every 15s, Last updated (Asia/Jerusalem). Past due and cancelled rows leave the board automatically.",
    },
    {
      title: "Urgency rail",
      body: "Green = assigned. Yellow = unassigned 10–30 min. Red = under 10 min / overdue. Neutral = more than 30 min.",
    },
    {
      title: "Driver confirmed",
      body: "Shared operator marks (Confirmed / No answer / Issue) with who + when. Driver column on the list (name, phone, car).",
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
  const s = base("Ops");
  s.addText("Operator UX", {
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
    "Sticky header: Live / Unassigned / At risk counters",
    "Sort by scheduledAt ASC (nearest due on top)",
    "Map markers use the same urgency colors",
    "SQL: scripts/sql/supabase_preorder_operator_marks.sql (apply in Supabase for shared marks)",
  ];
  bullets.forEach((line, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.2 + i * 1.15,
      w: 12.2,
      h: 1.0,
      fill: { color: "F5F6F8" },
      rectRadius: 0.1,
    });
    s.addText(line, {
      x: 0.8,
      y: 1.45 + i * 1.15,
      w: 11.7,
      h: 0.5,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
    });
  });
  footer(s, 3);
}

{
  const s = base("Fleet pending");
  s.addText("Fleet driver enrichment — not finished", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.5,
    fontFace: FONT,
    fontSize: 26,
    color: C.text,
    bold: true,
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.55,
    y: 1.2,
    w: 12.2,
    h: 4.6,
    fill: { color: C.amberSoft },
    rectRadius: 0.12,
  });
  s.addText("Waiting on Yango / Yandex Fleet API support", {
    x: 0.85,
    y: 1.5,
    w: 11.6,
    h: 0.4,
    fontFace: FONT,
    fontSize: 18,
    color: C.amber,
    bold: true,
  });
  s.addText(
    [
      {
        text: "Adapter is wired: live pre-orders can enrich driver name / phone / car from the park when Fleet auth works.",
        options: { breakLine: true },
      },
      {
        text: "Current park API key (fleet-e) is rejected by fleet-api.yango.tech with 403 invalid client id or api key.",
        options: { breakLine: true },
      },
      {
        text: "Until Yango confirms the key, UI keeps Unknown Driver fallback from B2B performer data.",
        options: { breakLine: true },
      },
      {
        text: "Trace shared with support: x-yatraceid 629384d315dcbb7172e2a89ff0c4d968.",
        options: { breakLine: false },
      },
    ],
    {
      x: 0.85,
      y: 2.2,
      w: 11.6,
      h: 3.2,
      fontFace: FONT,
      fontSize: 15,
      color: C.text,
      paraSpaceAfter: 12,
    },
  );
  footer(s, 4);
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
      { text: "1. Open ", options: { breakLine: false } },
      { text: "/sales-operation/pre-orders", options: { bold: true, breakLine: false } },
      { text: " — Live badge + Last updated ticking ~15s.", options: { breakLine: true } },
      {
        text: "2. Unassigned due in ~20 min = yellow rail; under 10 min = red; assigned = green.",
        options: { breakLine: true },
      },
      {
        text: "3. Mark Driver confirmed — second browser / operator should see the same chip.",
        options: { breakLine: true },
      },
      {
        text: "4. Apply supabase_preorder_operator_marks.sql if marks should be shared across instances.",
        options: { breakLine: true },
      },
    ],
    {
      x: 0.55,
      y: 1.2,
      w: 12.2,
      h: 3.4,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
      paraSpaceAfter: 12,
    },
  );
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.55,
    y: 5.2,
    w: 12.2,
    h: 1.4,
    fill: { color: C.greenSoft },
    rectRadius: 0.12,
  });
  s.addText("Prod: https://applitaxi.space/sales-operation/pre-orders", {
    x: 0.8,
    y: 5.65,
    w: 11.7,
    h: 0.5,
    fontFace: FONT,
    fontSize: 18,
    color: C.green,
    bold: true,
  });
  footer(s, 5);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
console.log("Copied", OUT_DESKTOP);
