/**
 * Release 0.2.60 deck: Yango B2B API EU host / pre-orders restored.
 * Usage: node scripts/presentations/generate-release-0-2-60-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const OUT_REPO = join(ROOT, "docs/presentations/Yango-Sales-Operations-Yango-API-EU-0-2-60.pptx");
const OUT_DESKTOP = join(homedir(), "Desktop/Yango-Sales-Operations-Yango-API-EU-0-2-60.pptx");

const C = {
  accent: "FF2D2D",
  text: "14161A",
  muted: "6B7280",
  muted2: "8A919E",
  white: "FFFFFF",
  soft: "FFF1F1",
  green: "059669",
  greenSoft: "ECFDF5",
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
pptx.subject = "Release 0.2.60 — Yango B2B API EU host";
pptx.title = "Yango Sales Operations — Pre-Orders API host (0.2.60)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.60 · Confidential", {
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
  s.addText("RELEASE 0.2.60", {
    x: 0.55,
    y: 2.2,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
    bold: true,
  });
  s.addText("Yango B2B API EU host", {
    x: 0.55,
    y: 2.7,
    w: 12,
    h: 0.7,
    fontFace: FONT,
    fontSize: 36,
    color: C.text,
    bold: true,
  });
  s.addText("Pre-Orders and live B2B lists talk to b2b-api-e.yango.com again.", {
    x: 0.55,
    y: 3.5,
    w: 11,
    h: 0.4,
    fontFace: FONT,
    fontSize: 16,
    color: C.muted,
  });
  footer(s, 1);
}

{
  const s = base("Problem");
  s.addText("What broke", {
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
      title: "Old host",
      body: "b2b-api.yango.com still answered auth/list, but future due orders were empty for most cabinets.",
    },
    {
      title: "Symptom in CRM",
      body: "Pre-Orders showed roughly one client. Operators assumed tokens or filters were wrong.",
    },
    {
      title: "Root cause",
      body: "Yango moved Integration API traffic to the EU endpoint. The CRM default base URL was never updated.",
    },
  ];
  cards.forEach((card, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.3,
      w: 3.95,
      h: 4.4,
      fill: { color: C.soft },
      rectRadius: 0.12,
    });
    s.addText(card.title, {
      x: x + 0.25,
      y: 1.55,
      w: 3.45,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      color: C.accent,
      bold: true,
    });
    s.addText(card.body, {
      x: x + 0.25,
      y: 2.15,
      w: 3.45,
      h: 3.2,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
    });
  });
  footer(s, 2);
}

{
  const s = base("Fix");
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
  const bullets = [
    "Default base URL → https://b2b-api-e.yango.com/integration (+ /2.0/… paths)",
    "Optional override: YANGO_API_BASE_URL (Vercel / local)",
    "Pre-order auth / list / info use cache: no-store (no cross-cabinet Next fetch cache)",
    "waiting treated as in-progress so live rides stay on Orders, not Pre-Orders",
    "Rule unchanged: Pre-Orders = due_date > now; every configured token is polled",
  ];
  bullets.forEach((line, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.2 + i * 0.95,
      w: 12.2,
      h: 0.85,
      fill: { color: i === 0 ? C.greenSoft : "F5F6F8" },
      rectRadius: 0.1,
    });
    s.addText(line, {
      x: 0.8,
      y: 1.38 + i * 0.95,
      w: 11.7,
      h: 0.5,
      fontFace: FONT,
      fontSize: 15,
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
      { text: "1. Open ", options: { breakLine: false } },
      { text: "/sales-operation/pre-orders", options: { bold: true, breakLine: false } },
      {
        text: " — expect multiple clients when they have future scheduling (e.g. SHUFERSAL, Samelet, Hamoshava, Yaron Bar).",
        options: { breakLine: true },
      },
      { text: "2. ", options: { breakLine: false } },
      { text: "API Health Check", options: { bold: true, breakLine: false } },
      { text: " — tokens still auth ok against the EU host.", options: { breakLine: true } },
      { text: "3. When another cabinet books a future ride, it appears automatically — no per-client code change.", options: { breakLine: true } },
    ],
    {
      x: 0.55,
      y: 1.3,
      w: 12.2,
      h: 3.5,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
      paraSpaceAfter: 14,
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
  footer(s, 4);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
console.log("Copied", OUT_DESKTOP);
