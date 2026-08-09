/**
 * Release 0.2.52 deck: Route Bundles + Operations HUB.
 * Usage: node scripts/presentations/generate-release-0-2-52-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const SHOTS = join(ASSETS, "release-0-2-52");
const OUT_REPO = join(
  ROOT,
  "docs/presentations/Yango-Sales-Operations-Route-Bundles-0-2-52.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Route-Bundles-0-2-52.pptx",
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
  sky: "0EA5E9",
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
pptx.subject = "Release 0.2.52 — Route Bundles + Operations HUB";
pptx.title = "Yango Sales Operations — Route Bundles (0.2.52)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.52 · Confidential", {
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
  s.addText("RELEASE 0.2.52", {
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
  s.addText("Route Bundles for\npre-order chaining", {
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
    "Suggest exclusive driver routes · map with road polylines · Operations HUB under Sales Operation",
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
  heading(s, "Agenda", "What shipped in 0.2.52", "Ops tools moved into SO HUB + smart route suggestions");
  const items = [
    ["01", "Operations HUB", "Pre-Orders, Orders, Route Bundles, Price Calculator, API Health Check"],
    ["02", "Route Bundles engine", "Beam search + exclusive packing — more short routes, no shared orders"],
    ["03", "Map workspace", "Road polylines, multicolor legs, client name in popups"],
    ["04", "Workflow", "Suggested → call driver → accept · recalculate · opportunities"],
    ["05", "Settings & RBAC", "Buffers, empty-drive km, candidate caps · preOrders permission"],
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

// 3 HUB screenshot
{
  const s = base();
  heading(
    s,
    "Operations HUB",
    "Pre-Orders live under Sales Operation",
    "Legacy /pre-orders and /orders redirect into the SO shell",
  );
  addShot(s, "01-hub-preorders", 0.5, 1.55, 12.3, 5.3);
  footer(s, 3);
}

// 4 Route bundles list
{
  const s = base();
  heading(
    s,
    "Route Bundles",
    "Suggested exclusive chains from the open pool",
    "Generate rebuilds suggestions · statuses for call / accept / active",
  );
  addShot(s, "02-route-bundles-list", 0.5, 1.55, 12.3, 5.3);
  footer(s, 4);
}

// 5 Map
{
  const s = base();
  heading(
    s,
    "Map",
    "Real Google road geometry — not straight lines",
    "Each order leg has its own color · dashed empty drives · client in marker popups",
  );
  addShot(s, "03-route-bundles-map", 0.5, 1.55, 12.3, 5.3);
  footer(s, 5);
}

// 6 How it works
{
  const s = base();
  heading(
    s,
    "Engine",
    "How suggestions are built",
    "Same token · time buffers · empty-drive limits · Google Routes + Matrix",
  );
  const cards = [
    ["Enrich", "Pull open pre-orders, resolve pickup/dropoff coords (API → geocode)", "blue"],
    ["Search", "Beam-search compatible chains (2…N) with traffic-aware travel times", "violet"],
    ["Pack", "Exclusive packing prefers more short routes over one long chain", "amber"],
    ["Preview", "Persist snapshot geojson; on open, upgrade stubs to road polylines", "green"],
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
  footer(s, 6);
}

// 7 Settings
{
  const s = base();
  heading(
    s,
    "Settings",
    "Tune buffers, empty drive, and pool size",
    "Write access: Admin / salesSettings · link from Sales Settings",
  );
  addShot(s, "04-route-bundles-settings", 0.5, 1.55, 12.3, 5.3);
  footer(s, 7);
}

// 8 Orders + health
{
  const s = base();
  heading(
    s,
    "HUB neighbors",
    "Orders + API Health Check in the same shell",
    "Token health moved out of Notes into dedicated API Health Check",
  );
  addShot(s, "05-hub-orders", 0.5, 1.55, 6.0, 5.3);
  addShot(s, "06-api-health-check", 6.8, 1.55, 6.0, 5.3);
  footer(s, 8);
}

// 9 Price calculator
{
  const s = base();
  heading(
    s,
    "HUB",
    "Price Calculator stays next to ops tools",
    "One place for pre-order ops, pricing, and route planning",
  );
  addShot(s, "07-price-calculator", 0.5, 1.55, 12.3, 5.3);
  footer(s, 9);
}

// 10 Features checklist
{
  const s = base();
  heading(s, "Features", "Release checklist", "Everything operators need for day-one Route Bundles");
  const bullets = [
    "Generate exclusive suggested routes from mappable pre-orders",
    "List tabs: Suggested / Active / All · health badges & explain text",
    "MapLibre map: passenger + empty-drive legs, multicolor per order",
    "Marker popups: client name + pickup/dropoff route text",
    "Edit sequence (DnD), add/remove order, recalculate with Google",
    "Driver assignment after call · status workflow",
    "Insertion opportunities banner (accept / dismiss)",
    "Settings: max orders, safety buffer, empty km, matrix budget, candidates",
    "SQL tables applied · GOOGLE_MAPS_API_KEY required on Vercel",
    "EN + HE copy · RBAC via preOrders / notes / salesSettings",
  ];
  bullets.forEach((b, i) => {
    const col = i < 5 ? 0 : 1;
    const row = i % 5;
    const x = 0.5 + col * 6.4;
    const y = 1.55 + row * 0.95;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 6.15,
      h: 0.82,
      fill: { color: C.bg },
      line: { color: C.border },
      rectRadius: 0.08,
    });
    s.addText("•  " + b, {
      x: x + 0.2,
      y: y + 0.18,
      w: 5.75,
      h: 0.5,
      fontFace: FONT,
      fontSize: 13,
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
  s.addText("Try it on prod", {
    x: 0.7,
    y: 2.4,
    w: 12,
    h: 0.6,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: C.white,
  });
  s.addText("https://applitaxi.space/sales-operation/route-bundles", {
    x: 0.7,
    y: 3.2,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 18,
    color: C.accent,
  });
  s.addText("Generate → open a suggestion → review map & buffers → contact driver → Accept", {
    x: 0.7,
    y: 4.0,
    w: 11.5,
    h: 0.5,
    fontFace: FONT,
    fontSize: 16,
    color: "B8BFC9",
  });
  s.addText("Yango · Sales Operations · Release 0.2.52", {
    x: 0.7,
    y: 6.7,
    w: 10,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    color: C.muted2,
  });
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
console.log("wrote", OUT_REPO);
try {
  copyFileSync(OUT_REPO, OUT_DESKTOP);
  console.log("copied", OUT_DESKTOP);
} catch (e) {
  console.warn("Desktop copy skipped:", e.message);
}
