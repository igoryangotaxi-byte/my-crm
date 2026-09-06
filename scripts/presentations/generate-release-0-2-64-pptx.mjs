/**
 * Release 0.2.64 deck: Public Tracker submit form.
 * Usage: node scripts/presentations/generate-release-0-2-64-pptx.mjs
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
  "docs/presentations/Yango-Sales-Operations-Public-Ticket-Form-0-2-64.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Public-Ticket-Form-0-2-64.pptx",
);

const C = {
  accent: "FF2D2D",
  text: "14161A",
  muted: "6B7280",
  muted2: "8A919E",
  white: "FFFFFF",
  soft: "FFF1F1",
  green: "059669",
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
pptx.title = "Yango Sales Operations — Public Ticket Form (0.2.64)";
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

function footer(slide, page, total = 3) {
  slide.addText("Yango · Sales Operations · Release 0.2.64 · Confidential", {
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
  s.addText("RELEASE 0.2.64", {
    x: 0.55,
    y: 2.15,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
    bold: true,
  });
  s.addText("Public ticket form for unregistered users", {
    x: 0.55,
    y: 2.65,
    w: 12,
    h: 1.1,
    fontFace: FONT,
    fontSize: 32,
    color: C.text,
    bold: true,
  });
  s.addText(
    "CRM-styled /submit-ticket → Tracker To Do · Title, Description, Priority, attachments",
    {
      x: 0.55,
      y: 4.0,
      w: 11.5,
      h: 0.5,
      fontFace: FONT,
      fontSize: 16,
      color: C.muted,
    },
  );
  footer(s, 1);
}

{
  const s = base("What shipped");
  s.addText("What shipped", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 26,
    color: C.text,
    bold: true,
  });
  const items = [
    "Public page /submit-ticket — no login; SO fonts, colors, and chrome",
    "Fields: Title, Description, Priority (Low / Normal / High / Urgent)",
    "Attachments: up to 5 photos/files (10MB each) stored on the ticket",
    "Creates tickets in Tracker project …6768f689, column To Do",
    "Author shown as External form; rate limit + honeypot against spam",
  ];
  items.forEach((t, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.2 + i * 0.95,
      w: 12.2,
      h: 0.82,
      fill: { color: i % 2 === 0 ? C.soft : "F7F8FA" },
      rectRadius: 0.1,
    });
    s.addText(t, {
      x: 0.75,
      y: 1.35 + i * 0.95,
      w: 11.8,
      h: 0.5,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
    });
  });
  footer(s, 2);
}

{
  const s = base("Links");
  s.addText("Links & smoke check", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 26,
    color: C.text,
    bold: true,
  });
  const checks = [
    "Form: https://applitaxi.space/submit-ticket",
    "Board: /sales-operation/tracker/2cc7d354-1f6f-42d5-bb37-1efd6768f689 → To Do",
    "Smoke: submit Title + Description + photo → card appears in To Do as External form",
    "Optional env override: PUBLIC_TRACKER_PROJECT_ID, PUBLIC_TRACKER_STATUS_NAME",
  ];
  checks.forEach((t, i) => {
    s.addShape(pptx.ShapeType.ellipse, {
      x: 0.65,
      y: 1.35 + i * 1.2,
      w: 0.35,
      h: 0.35,
      fill: { color: C.green },
    });
    s.addText(String(i + 1), {
      x: 0.65,
      y: 1.38 + i * 1.2,
      w: 0.35,
      h: 0.3,
      fontFace: FONT,
      fontSize: 12,
      color: C.white,
      align: "center",
      bold: true,
    });
    s.addText(t, {
      x: 1.2,
      y: 1.35 + i * 1.2,
      w: 11.4,
      h: 0.9,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
    });
  });
  footer(s, 3);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
console.log("Copied", OUT_DESKTOP);
