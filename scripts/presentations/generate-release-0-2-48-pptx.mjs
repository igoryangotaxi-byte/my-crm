/**
 * Release 0.2.48 deck: Signed B2B handover automation.
 * Usage: node scripts/presentations/generate-release-0-2-48-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-48");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Signed-Handover-0-2-48.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Signed-Handover-0-2-48.pptx",
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
};

const FONT = "Arial";
const TOTAL = 9;

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
pptx.subject = "Release 0.2.48 — Signed B2B handover";
pptx.title = "Yango Sales Operations — Signed Handover (0.2.48)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.48 · Confidential", {
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
  s.addText("RELEASE 0.2.48", {
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
  s.addText("Signed B2B\nhandover automation", {
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
    "Default Account Manager · Onboarding + First Touch · Calendar · Tracker launch checklist",
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
  heading(s, "Agenda", "What happens when a deal becomes Signed", "One transition → AM + task + meeting + Tracker ticket");
  const items = [
    ["01", "Default Account Manager", "Stage Gate prefills AM from Settings (fallback igorrebkovets@appli.taxi)"],
    ["02", "Onboarding + First Touch", "Single high-priority task assigned to the Account Manager"],
    ["03", "Calendar meeting", "45-minute slot on the next business day for the AM"],
    ["04", "Tracker launch prep", "Ticket with fixed checklist in the configured project"],
    ["05", "Settings", "Change default AM and Tracker project anytime"],
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

// 3 Settings
{
  const s = base();
  heading(s, "Settings", "Configure once — reuse on every Signed deal", "Sales Operation → Settings → Signed handover");
  addShot(s, "01-settings-handover", 0.5, 1.55, 8.2, 5.2);
  bulletCard(s, 9.0, 1.55, 3.8, 5.2, "Configure", [
    "• Default Account Manager",
    "• Tracker project for",
    "  launch-prep tickets",
    "• Change anytime — Gate",
    "  still allows override",
    "",
    "SQL required once:",
    "supabase_sales_signed_",
    "handover_settings.sql",
  ]);
  footer(s, 3);
}

// 4 Pipeline / gate
{
  const s = base();
  heading(s, "Pipeline", "Move the lead to Signed", "Stage Gate prefills Account Manager — change before confirm if needed");
  addShot(s, "02-pipeline", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "On confirm",
    [
      "• AM saved on B2B client",
      "• Client conversion runs",
      "• Handover automation",
      "  starts for that AM",
    ],
    "violet",
  );
  footer(s, 4);
}

// 5 Task
{
  const s = base();
  heading(s, "My Space", "Onboarding + First Touch task", "Assigned to the Account Manager · high priority · due in 2 days");
  addShot(s, "05-myspace", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Replaces",
    [
      "• Old: Onboard Client (SM)",
      "• Old: First Client Call",
      "• New: one combined task",
      "  for the Account Manager",
    ],
    "blue",
  );
  footer(s, 5);
}

// 6 Calendar
{
  const s = base();
  heading(s, "Calendar", "Meeting auto-created for the AM", "Next business day · 10:00 · 45 minutes · linked to client when available");
  addShot(s, "04-calendar", 0.5, 1.55, 8.2, 5.2);
  bulletCard(
    s,
    9.0,
    1.55,
    3.8,
    5.2,
    "Notes",
    [
      "• Lives on AM calendar",
      "• Best-effort Google sync",
      "  if connected",
      "• Never blocks Signed",
    ],
    "amber",
  );
  footer(s, 6);
}

// 7 Tracker
{
  const s = base();
  heading(s, "Tracker", "Launch prep ticket + checklist", "Created in the project from Settings · assigned to AM");
  addShot(s, "03-tracker", 0.5, 1.55, 8.2, 5.2);
  bulletCard(s, 9.0, 1.55, 3.8, 5.2, "Checklist", [
    "1. Tariff setup",
    "2. Credit limit setup",
    "3. Special conditions",
    "4. Credit card connect",
    "5. Contract / terms review",
    "",
    "Title: Launch prep — {client}",
  ]);
  footer(s, 7);
}

// 8 Ops
{
  const s = base();
  heading(s, "Ops checklist", "After deploy", "Code is live — schema + settings complete the loop");
  const rows = [
    ["Database", "Apply supabase_sales_signed_handover_settings.sql in Supabase"],
    ["Settings", "Pick default AM + Tracker project under Signed handover"],
    ["Smoke test", "Move a test lead to Signed → check task, meeting, Tracker ticket"],
    ["Version", "App 0.2.48 · Signed B2B handover automation"],
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
  footer(s, 8);
}

// 9 Close
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
  s.addText("From Signed to launch-ready", {
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
    "Account Manager, first touch, calendar, and Tracker checklist — triggered by one stage move.",
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
  s.addText("applitaxi.space  ·  Sales Operations  ·  0.2.48", {
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
