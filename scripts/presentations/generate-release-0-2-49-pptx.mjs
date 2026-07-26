/**
 * Release 0.2.49 deck: Lead Discovery.
 * Usage: node scripts/presentations/generate-release-0-2-49-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-49");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Lead-Discovery-0-2-49.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Lead-Discovery-0-2-49.pptx",
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
pptx.subject = "Release 0.2.49 — Lead Discovery";
pptx.title = "Yango Sales Operations — Lead Discovery (0.2.49)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.49 · Confidential", {
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
  s.addText("RELEASE 0.2.49", {
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
  s.addText("Lead Discovery\nfor Israel B2B", {
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
    "Segment campaigns · Google Places · Groq qualification · Approve before pipeline",
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
  heading(
    s,
    "Agenda",
    "Find, score, and approve B2B leads automatically",
    "New module at /sales-operation/lead-discovery",
  );
  const items = [
    ["01", "Describe a segment", "Natural language → Groq interprets categories, cities, size, rules"],
    ["02", "Run Find leads", "Google Places search + scoring; one campaign at a time"],
    ["03", "Approve candidates", "Review pending leads before they enter the pipeline"],
    ["04", "Automations", "Triggers for discovered / qualified / daily target / email reply"],
    ["05", "Ops & cron", "Daily target in Advanced; discovery tick every 2 hours"],
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

// 3 Dashboard shot
{
  const s = base();
  heading(s, "Product", "Campaign dashboard", "KPI tiles · active / paused · Find leads · Stop");
  addShot(s, "01-dashboard", 0.5, 1.5, 12.3, 5.3);
  footer(s, 3);
}

// 4 Wizard
{
  const s = base();
  heading(
    s,
    "Create",
    "Segment wizard powered by Groq",
    "Describe once → review categories, cities, qualification rules → create",
  );
  addShot(s, "02-wizard", 0.5, 1.5, 12.3, 5.3);
  footer(s, 4);
}

// 5 Candidates
{
  const s = base();
  heading(
    s,
    "Review",
    "Approve before pipeline",
    "Candidates stay pending until a manager accepts them into Sales Pipeline",
  );
  addShot(s, "03-candidates", 0.5, 1.5, 12.3, 5.3);
  footer(s, 5);
}

// 6 How it works cards
{
  const s = base();
  heading(s, "Flow", "From segment text to pipeline lead", "Deterministic scoring with optional LLM nudge");
  bulletCard(
    s,
    0.5,
    1.55,
    4,
    5.2,
    "1 · Interpret",
    [
      "Groq turns free text into business types,",
      "cities, size filter, and qualification rules.",
      "",
      "Heuristic fallback if rate-limited (429).",
      "Catalog synonyms (e.g. лизинг → leasing).",
    ],
    "blue",
  );
  bulletCard(
    s,
    4.7,
    1.55,
    4,
    5.2,
    "2 · Discover",
    [
      "Google Places search per city × type.",
      "Score with rule weights; closed places out.",
      "",
      "One running campaign at a time.",
      "Stop works mid-run; progress after save.",
    ],
    "violet",
  );
  bulletCard(
    s,
    8.9,
    1.55,
    3.9,
    5.2,
    "3 · Approve",
    [
      "Pending approval queue.",
      "Approve → create pipeline lead.",
      "",
      "Cron tick every 2h for active campaigns.",
      "Daily target editable in Advanced.",
    ],
    "amber",
  );
  footer(s, 6);
}

// 7 Automation
{
  const s = base();
  heading(
    s,
    "Automation",
    "New discovery-aware nodes",
    "Wire Lead Discovery into SMS, tasks, stickers, email sequences",
  );
  addShot(s, "04-automation", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "New triggers & actions",
    [
      "Lead discovered (min score)",
      "Qualification completed",
      "Daily target not reached",
      "Email replied",
      "Condition gate",
      "",
      "Actions: notify, sticker,",
      "start email sequence",
    ],
    "soft",
  );
  footer(s, 7);
}

// 8 Advanced + SQL
{
  const s = base();
  heading(s, "Ops", "Advanced settings & schema", "Apply SQL in Supabase before first production use");
  addShot(s, "05-advanced", 0.5, 1.5, 7.6, 5.3);
  bulletCard(
    s,
    8.3,
    1.5,
    4.5,
    5.3,
    "Ship checklist",
    [
      "SQL: supabase_sales_lead_discovery.sql",
      "SQL: …_pending_approval.sql",
      "",
      "Env: LEAD_DISCOVERY_ENABLED=1",
      "GOOGLE_PLACES_API_KEY (or Maps)",
      "GROQ_API_KEY + model",
      "CRON_SECRET for discovery-tick",
      "",
      "Permission: salesLeadDiscovery (v13)",
    ],
    "blue",
  );
  footer(s, 8);
}

// 9 Closing
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
    y: 2.4,
    w: 11,
    h: 0.5,
    fontFace: FONT,
    fontSize: 18,
    color: C.accent,
    bold: true,
  });
  s.addText("https://applitaxi.space/sales-operation/lead-discovery", {
    x: 0.7,
    y: 3.1,
    w: 12,
    h: 0.6,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: C.white,
  });
  s.addText("Release 0.2.49 · Lead Discovery · Appli Taxi Oz", {
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
