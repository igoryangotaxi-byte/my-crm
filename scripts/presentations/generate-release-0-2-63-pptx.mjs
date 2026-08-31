/**
 * Release 0.2.63 deck: Call Center + Request Rides + change intermediate stops.
 * Usage: node scripts/presentations/generate-release-0-2-63-pptx.mjs
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
  "docs/presentations/Yango-Sales-Operations-Call-Center-Request-Rides-0-2-63.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Call-Center-Request-Rides-0-2-63.pptx",
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
pptx.title = "Yango Sales Operations — Call Center + Request Rides (0.2.63)";
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
  slide.addText("Yango · Sales Operations · Release 0.2.63 · Confidential", {
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
  s.addText("RELEASE 0.2.63", {
    x: 0.55,
    y: 2.15,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
    bold: true,
  });
  s.addText("Call Center · Request Rides · Change intermediate stops", {
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
    "3CX dial/answer from CRM · order taxi in HUB · update stops without cancelling",
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
  const s = base("Call Center");
  s.addText("Call Center (3CX)", {
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
    "HUB page: link corporate PBX extension, operator status, dialer",
    "Click-to-call on driver phones (Pre-Orders, Orders, Route Bundles, map)",
    "Incoming toast + mute CRM notifications (audio stays on 3CX device)",
    "Bar Oz webhooks: lookup / add contact / Call Report with recording URL",
    "SQL: scripts/sql/supabase_call_center.sql — apply in Supabase",
    "Env: THREECX_BASE_URL, CLIENT_ID, CLIENT_SECRET, CRM_WEBHOOK_SECRET",
  ];
  items.forEach((t, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.15 + i * 0.85,
      w: 12.2,
      h: 0.72,
      fill: { color: i % 2 === 0 ? C.soft : "F7F8FA" },
      rectRadius: 0.1,
    });
    s.addText(t, {
      x: 0.75,
      y: 1.28 + i * 0.85,
      w: 11.8,
      h: 0.45,
      fontFace: FONT,
      fontSize: 15,
      color: C.text,
    });
  });
  footer(s, 2);
}

{
  const s = base("Request Rides + route");
  s.addText("Request Rides + change stops", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.45,
    fontFace: FONT,
    fontSize: 26,
    color: C.text,
    bold: true,
  });
  const left = [
    { h: "Request Rides in SO HUB", b: "Same create UI as legacy CRM, full-bleed map shell, RBAC requestRides." },
    { h: "Yango change-destinations", b: "Edit or add intermediate stops without cancelling the order." },
  ];
  const right = [
    { h: "Where", b: "Pre-Orders drawer + Scheduled ride card on Request Rides." },
    { h: "Driver cases", b: "Works with/without driver; CRM confirms if assigned. Yango may 400 mid-trip." },
  ];
  [...left].forEach((card, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.2 + i * 2.4,
      w: 5.9,
      h: 2.1,
      fill: { color: "F7F8FA" },
      rectRadius: 0.12,
    });
    s.addText(card.h, {
      x: 0.8,
      y: 1.4 + i * 2.4,
      w: 5.4,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: C.text,
    });
    s.addText(card.b, {
      x: 0.8,
      y: 1.95 + i * 2.4,
      w: 5.4,
      h: 1.0,
      fontFace: FONT,
      fontSize: 14,
      color: C.muted,
    });
  });
  right.forEach((card, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 6.85,
      y: 1.2 + i * 2.4,
      w: 5.9,
      h: 2.1,
      fill: { color: C.soft },
      rectRadius: 0.12,
    });
    s.addText(card.h, {
      x: 7.1,
      y: 1.4 + i * 2.4,
      w: 5.4,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: C.text,
    });
    s.addText(card.b, {
      x: 7.1,
      y: 1.95 + i * 2.4,
      w: 5.4,
      h: 1.0,
      fontFace: FONT,
      fontSize: 14,
      color: C.muted,
    });
  });
  footer(s, 3);
}

{
  const s = base("Ship checklist");
  s.addText("Ship checklist", {
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
    "Apply supabase_call_center.sql in Supabase (tables already verified on project in some envs)",
    "Set THREECX_* on Vercel (BASE_URL + webhook secret done; CLIENT_ID/SECRET need System Owner)",
    "Paste Bar Oz CRM webhook URLs with ?key= into 3CX; enable PBX recording",
    "Smoke: /sales-operation/request-rides create · Pre-Orders / ride card edit stop · Call Center extension",
  ];
  checks.forEach((t, i) => {
    s.addShape(pptx.ShapeType.ellipse, {
      x: 0.65,
      y: 1.35 + i * 1.15,
      w: 0.35,
      h: 0.35,
      fill: { color: C.green },
    });
    s.addText(String(i + 1), {
      x: 0.65,
      y: 1.38 + i * 1.15,
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
      y: 1.35 + i * 1.15,
      w: 11.4,
      h: 0.9,
      fontFace: FONT,
      fontSize: 16,
      color: C.text,
    });
  });
  footer(s, 4);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
console.log("Copied", OUT_DESKTOP);
