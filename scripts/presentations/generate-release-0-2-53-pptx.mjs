/**
 * Release 0.2.53 deck: Yango corp register + Signed Corp Client ID + B2B managers.
 * Usage: node scripts/presentations/generate-release-0-2-53-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-53");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Corp-Register-0-2-53.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Corp-Register-0-2-53.pptx",
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
pptx.subject = "Release 0.2.53 — Yango corp register + Signed Corp Client ID";
pptx.title = "Yango Sales Operations — Corp Register (0.2.53)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.53 · Confidential", {
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
  s.addText("RELEASE 0.2.53", {
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
  s.addText("Yango client registration\non every lead card", {
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
    "Signed requires Corp Client ID · assign SM / AM from pipeline · hydrate from B2B Overview",
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
  heading(s, "Agenda", "What shipped in 0.2.53", "Register earlier · sign with a real Corp Client ID · assign managers without leaving the pipeline");
  const items = [
    ["01", "Yango form on the lead card", "Available in any status — expand in-place or open a new window"],
    ["02", "Signed gate", "Corp Client ID is required. Contract number alone is not enough"],
    ["03", "Assign SM + AM", "Search B2B clients and save managers from Client details"],
    ["04", "Pending SM → map", "When Corp Client ID is linked, pending sales manager writes to gp_corp_client_map"],
    ["05", "New leads from Overview", "Create-lead hydrates name + SM from B2B Client Overview"],
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

// 3 Pipeline
{
  const s = base();
  heading(s, "Pipeline", "Work the deal from the board", "Open any lead — registration and managers live on the card, not only at Signed");
  addShot(s, "01-pipeline", 0.5, 1.55, 8.2, 5.2);
  bulletCard(s, 9.0, 1.55, 3.8, 5.2, "Why it matters", [
    "• Register the B2B client",
    "  before the last stage",
    "• Same card for SM / AM",
    "• Signed still needs a",
    "  Corp Client ID",
  ]);
  footer(s, 3);
}

// 4 Accordion collapsed
{
  const s = base();
  heading(
    s,
    "Lead card",
    "Yango client registration accordion",
    "Any status · Overview tab · no fake “completed” pill",
  );
  addShot(s, "02-lead-yango-collapsed", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "On the card",
    [
      "• Collapsed by default",
      "• Next to Corp Client ID",
      "• Removed from the",
      "  Signed stage-gate modal",
    ],
    "violet",
  );
  footer(s, 4);
}

// 5 Accordion open
{
  const s = base();
  heading(
    s,
    "Lead card",
    "Fill the offer form without leaving CRM",
    "Embedded iframe + Open in new window",
  );
  addShot(s, "03-lead-yango-open", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Isolated widget",
    [
      "• Yango CSS stays inside",
      "  the iframe",
      "• Full page available at",
      "  /sales-operation/",
      "  corp-register",
      "• No feedback FAB there",
    ],
    "blue",
  );
  footer(s, 5);
}

// 6 Standalone form
{
  const s = base();
  heading(
    s,
    "Standalone page",
    "Clean Yango registration window",
    "/sales-operation/corp-register — compact chrome, no feedback icon",
  );
  addShot(s, "06-corp-register", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Use when",
    [
      "• Form needs more space",
      "• Sharing a focused tab",
      "• Embedding from the",
      "  lead accordion",
    ],
    "amber",
  );
  footer(s, 6);
}

// 7 Signed gate
{
  const s = base();
  heading(
    s,
    "Signed gate",
    "No Corp Client ID → no Signed",
    "Contract number is optional. Account Manager still required.",
  );
  addShot(s, "05-signed-stage-gate", 0.5, 1.55, 8.2, 5.2);
  bulletCard(s, 9.0, 1.55, 3.8, 5.2, "Server-enforced", [
    "• Stage Gate + API",
    "• IDs match case-",
    "  insensitively",
    "• Pending SM is applied",
    "  to gp_corp_client_map",
    "  when ID is linked",
  ]);
  footer(s, 7);
}

// 8 Managers
{
  const s = base();
  heading(
    s,
    "Client details",
    "Assign Sales + Account managers",
    "Search B2B by name or corp_client_id · selects stay enabled",
  );
  addShot(s, "04-client-details-managers", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Rules",
    [
      "• SM can save on the lead",
      "  even without Corp ID",
      "• AM needs a linked",
      "  B2B client",
      "• All platform staff",
      "  appear in the lists",
    ],
    "green",
  );
  footer(s, 8);
}

// 9 Hydrate + Overview
{
  const s = base();
  heading(
    s,
    "B2B Overview",
    "New leads pick up existing clients",
    "Create-lead + Overview search use gp_corp_client_map (case-insensitive)",
  );
  addShot(s, "07-b2b-overview", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Hydration",
    [
      "• Name + sales manager",
      "  from Overview row",
      "• Canonical Corp ID",
      "  casing is preserved",
      "• Explicit SM is not",
      "  overwritten",
    ],
    "violet",
  );
  footer(s, 9);
}

// 10 How to use
{
  const s = base();
  heading(s, "How to use", "Recommended flow", "Register early · link Corp ID · assign managers · then Sign");
  const rows = [
    ["1. Any stage", "Open the lead → expand Yango client registration → submit the offer form"],
    ["2. Link ID", "Paste Corp Client ID on Overview, or pick the B2B client in Client details"],
    ["3. Assign people", "Sales Manager on the lead; Account Manager after B2B is linked"],
    ["4. Move to Signed", "Gate asks only for Corp Client ID + AM — form is already on the card"],
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
      w: 2.6,
      h: 0.55,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: C.accent,
      valign: "middle",
    });
    s.addText(row[1], {
      x: 3.5,
      y: y + 0.2,
      w: 8.9,
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
  s.addText("Register first. Sign with a real ID.", {
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
    "Yango offer form on every lead · Corp Client ID gate · SM / AM from pipeline · Overview hydration.",
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
  s.addText("applitaxi.space  ·  Sales Operations  ·  0.2.53", {
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
