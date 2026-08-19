/**
 * Release 0.2.59 deck: Sales Operation Documentation wiki.
 * Usage: node scripts/presentations/generate-release-0-2-59-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-59");
const OUT_REPO = join(ROOT, "docs/presentations/Yango-Sales-Operations-Documentation-0-2-59.pptx");
const OUT_DESKTOP = join(homedir(), "Desktop/Yango-Sales-Operations-Documentation-0-2-59.pptx");

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
  blue: "2563EB",
  blueSoft: "EFF6FF",
  amber: "D97706",
  amberSoft: "FFFBEB",
};

const FONT = "Arial";
const TOTAL = 7;

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
pptx.subject = "Release 0.2.59 — Documentation wiki";
pptx.title = "Yango Sales Operations — Documentation (0.2.59)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.59 · Confidential", {
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

function photo(slide, name, x, y, w, h) {
  const path = shot(name);
  if (!path) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.08,
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
  slide.addImage({ path, x, y, w, h, sizing: { type: "cover", w, h } });
}

{
  const s = base("Title");
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.dark } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.accent } });
  const logo = logoPath();
  if (logo) s.addImage({ path: logo, x: 0.7, y: 0.55, w: 0.42, h: 0.42 });
  s.addText("RELEASE 0.2.59", {
    x: 1.25,
    y: 0.62,
    w: 8,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: C.accent,
    charSpacing: 2,
  });
  s.addText("Documentation wiki", {
    x: 0.7,
    y: 2.2,
    w: 12,
    h: 0.9,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: C.white,
  });
  s.addText("A shared Word-style workspace for Sales Operation — documents, tables, and file import, saved in Supabase.", {
    x: 0.7,
    y: 3.2,
    w: 11,
    h: 0.7,
    fontFace: FONT,
    fontSize: 16,
    color: "C9CDD6",
  });
  s.addText("applitaxi.space/sales-operation/documentation", {
    x: 0.7,
    y: 6.6,
    w: 11,
    h: 0.3,
    fontFace: FONT,
    fontSize: 13,
    color: C.accent,
  });
}

{
  const s = base("Why");
  heading(s, "Why this release", "Stop scattering process in chats and files", "One shared wiki the team can edit together.");
  const cards = [
    { t: "Vertical tabs", d: "Each document is a tab in a 240px rail: create, rename, drag reorder, delete." },
    { t: "Word-style editor", d: "Fonts, size, color, highlight, headings, lists, alignment — not markdown." },
    { t: "Tables + import", d: "CSV / XLSX become editable tables. DOCX body text, lists and tables flatten in." },
    { t: "Saved on the server", d: "TipTap JSON in documentation_documents. Autosave ~800ms, last-write-wins." },
  ];
  cards.forEach((card, i) => {
    const x = 0.5 + (i % 2) * 6.35;
    const y = 1.6 + Math.floor(i / 2) * 2.4;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 6.1,
      h: 2.2,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.1,
    });
    s.addText(card.t, { x: x + 0.3, y: y + 0.28, w: 5.5, h: 0.4, fontFace: FONT, fontSize: 18, bold: true, color: C.text });
    s.addText(card.d, { x: x + 0.3, y: y + 0.8, w: 5.5, h: 1.05, fontFace: FONT, fontSize: 14, color: C.muted });
  });
  footer(s, 2);
}

{
  const s = base("Workspace");
  heading(s, "Workspace", "Documents on the left, page on the right", "Hairline Linear-primary shell. Empty state until the first document.");
  photo(s, "workspace", 0.5, 1.55, 12.3, 5.3);
  footer(s, 3);
}

{
  const s = base("Editor");
  heading(s, "Editor", "Sticky toolbar and an A4-ish canvas", "Insert table, then add or remove rows and columns in place.");
  photo(s, "editor", 0.5, 1.55, 12.3, 5.3);
  footer(s, 4);
}

{
  const s = base("Import");
  heading(s, "Import", "CSV, spreadsheet or Word into the current page", "First sheet only for workbooks. Original files are not stored — content is the source of truth.");
  photo(s, "import-table", 0.5, 1.55, 12.3, 5.3);
  footer(s, 5);
}

{
  const s = base("Access");
  heading(s, "Access", "New page key: salesDocumentation", "On for Admin, Account Manager and Sales Manager. Off for User and Team Lead. Permissions v15.");
  photo(s, "access", 0.5, 1.55, 12.3, 5.3);
  footer(s, 6);
}

{
  const s = base("Ship");
  heading(s, "How to use", "Open Documentation, write, import, it autosaves", "SQL already registered in db:apply:sales-operation.");
  const rows = [
    ["Open", "Sidebar after Tracker, or ⌘K → Documentation."],
    ["Edit", "Format like Word. Tables are first-class, not a separate grid."],
    ["Import", "Toolbar → Import. CSV / XLSX / DOCX, max 5 MB."],
    ["Schema", "scripts/sql/supabase_sales_documentation.sql"],
  ];
  rows.forEach((row, i) => {
    const y = 1.6 + i * 1.15;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y,
      w: 12.3,
      h: 1.02,
      fill: { color: i % 2 ? C.blueSoft : C.bg },
      line: { color: C.border },
      rectRadius: 0.08,
    });
    s.addText(row[0], { x: 0.75, y: y + 0.28, w: 2.2, h: 0.45, fontFace: FONT, fontSize: 16, bold: true, color: C.accent });
    s.addText(row[1], { x: 3.1, y: y + 0.28, w: 9.3, h: 0.45, fontFace: FONT, fontSize: 15, color: C.text });
  });
  footer(s, 7);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log(`Wrote ${OUT_REPO}`);
console.log(`Copied ${OUT_DESKTOP}`);
