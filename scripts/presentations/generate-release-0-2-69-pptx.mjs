/**
 * Release 0.2.69 deck: Call Center Bar Oz usable + shell stage-1.
 * Usage: node scripts/presentations/generate-release-0-2-69-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const OUT_REPO = join(ROOT, "docs/presentations/Yango-Sales-Operations-Call-Center-Bar-Oz-0-2-69.pptx");
const OUT_DESKTOP = join(homedir(), "Desktop/Yango-Sales-Operations-Call-Center-Bar-Oz-0-2-69.pptx");
const C = { accent: "FF2D2D", text: "14161A", muted: "6B7280", muted2: "8A919E", white: "FFFFFF", soft: "FFF1F1" };
const FONT = "Arial";
const logo = existsSync(join(ASSETS, "yango-logo.png")) ? join(ASSETS, "yango-logo.png") : null;
const shot = join(ROOT, ".tmp-screens/cc-call-center-main.png");

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.title = "Yango Sales Operations — Call Center Bar Oz (0.2.69)";
pptx.lang = "en-US";

function base() {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.accent }, line: { color: C.accent } });
  return s;
}
function footer(s, page) {
  s.addText("Yango · Sales Operations · Release 0.2.69 · Confidential", {
    x: 0.5,
    y: 7.16,
    w: 10.5,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted2,
  });
  s.addText(`${page} / 3`, { x: 11.5, y: 7.16, w: 1.3, h: 0.2, fontFace: FONT, fontSize: 9, color: C.muted2, align: "right" });
}

{
  const s = base();
  if (logo) s.addImage({ path: logo, x: 0.55, y: 0.4, w: 1.1, h: 0.4 });
  s.addText("RELEASE 0.2.69", { x: 0.55, y: 2.1, w: 12, h: 0.35, fontFace: FONT, fontSize: 14, color: C.accent, bold: true });
  s.addText("Call Center Bar Oz ready", { x: 0.55, y: 2.55, w: 12, h: 0.8, fontFace: FONT, fontSize: 34, color: C.text, bold: true });
  s.addText("3CX webhooks, screen-pop, Dial without FaceTime, dense Jerusalem call log + shell stage-1.", {
    x: 0.55,
    y: 3.5,
    w: 11.5,
    h: 0.6,
    fontFace: FONT,
    fontSize: 16,
    color: C.muted,
  });
  footer(s, 1);
}
{
  const s = base();
  s.addText("What's new", { x: 0.55, y: 0.45, w: 12, h: 0.4, fontFace: FONT, fontSize: 22, color: C.text, bold: true });
  const bullets = [
    "Bar Oz Lookup / Create / Call Report — Israel phones, fail-closed key, idempotent reports",
    "Screen-pop drawer (~400px) with Dial + Open card; Answer is brand primary",
    "Labeled Dial on drivers & customers — 3CX only, no tel:/FaceTime fallback",
    "Dense call history in Asia/Jerusalem with filters",
    "SO shell stage-1: Compact default, red rail active nav, outline toggles",
    "Needs THREECX Call Control CLIENT_ID/SECRET for Dial; webhook secret already live",
  ];
  bullets.forEach((line, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.05 + i * 0.85,
      w: 12.2,
      h: 0.72,
      fill: { color: i % 2 === 0 ? C.soft : "F7F8FA" },
      line: { color: "EEEEF0" },
      rectRadius: 0.08,
    });
    s.addText(line, { x: 0.75, y: 1.17 + i * 0.85, w: 11.8, h: 0.5, fontFace: FONT, fontSize: 14, color: C.text });
  });
  footer(s, 2);
}
{
  const s = base();
  s.addText("On the screen", { x: 0.55, y: 0.4, w: 12, h: 0.4, fontFace: FONT, fontSize: 22, color: C.text, bold: true });
  if (existsSync(shot)) s.addImage({ path: shot, x: 0.7, y: 1.0, w: 11.9, h: 5.6 });
  else s.addText("Open /sales-operation/call-center", { x: 0.55, y: 2.8, w: 12, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted });
  footer(s, 3);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
try {
  copyFileSync(OUT_REPO, OUT_DESKTOP);
  console.log("Wrote", OUT_REPO, "and Desktop");
} catch (e) {
  console.log("Wrote", OUT_REPO, e.message);
}
