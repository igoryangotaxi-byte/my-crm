/**
 * Release 0.2.66 deck: durable Yango token registry hotfix.
 * Usage: node scripts/presentations/generate-release-0-2-66-pptx.mjs
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
  "docs/presentations/Yango-Sales-Operations-Token-Registry-Durable-0-2-66.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Token-Registry-Durable-0-2-66.pptx",
);

const C = { accent: "FF2D2D", text: "14161A", muted: "6B7280", muted2: "8A919E", white: "FFFFFF", soft: "FFF1F1", green: "059669" };
const FONT = "Arial";
function logoPath() {
  const path = join(ASSETS, "yango-logo.png");
  return existsSync(path) ? path : null;
}

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.title = "Yango Sales Operations — Token registry durable (0.2.66)";
pptx.lang = "en-US";

function base() {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.accent }, line: { color: C.accent } });
  return slide;
}
function footer(slide, page) {
  slide.addText("Yango · Sales Operations · Release 0.2.66 · Confidential", { x: 0.5, y: 7.16, w: 10.5, h: 0.2, fontFace: FONT, fontSize: 9, color: C.muted2 });
  slide.addText(`${page} / 2`, { x: 11.5, y: 7.16, w: 1.3, h: 0.2, fontFace: FONT, fontSize: 9, color: C.muted2, align: "right" });
}

{
  const s = base();
  const logo = logoPath();
  if (logo) s.addImage({ path: logo, x: 0.55, y: 0.4, w: 1.1, h: 0.4 });
  s.addText("RELEASE 0.2.66", { x: 0.55, y: 2.2, w: 12, h: 0.35, fontFace: FONT, fontSize: 14, color: C.accent, bold: true });
  s.addText("Token registry durable hotfix", { x: 0.55, y: 2.7, w: 12, h: 0.9, fontFace: FONT, fontSize: 32, color: C.text, bold: true });
  s.addText("Upstash KV quota exhausted → registry moved to Supabase Storage; never wipe KV with empty", {
    x: 0.55, y: 3.9, w: 12, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted,
  });
  footer(s, 1);
}

{
  const s = base();
  s.addText("What we fixed", { x: 0.55, y: 0.45, w: 12, h: 0.45, fontFace: FONT, fontSize: 26, color: C.text, bold: true });
  const items = [
    "Cause: Upstash KV max requests (500k) — registry-only cabinets vanished from Token diagnostics",
    "Durable store: sales-attachments/system/yango-token-registry-v1.json (+ optional SQL table)",
    "Safety: never write an empty registry over KV; memory cache 60s; KV mirror best-effort",
    "Env cabinets re-synced into durable storage. CLIENT_* cabinets: re-add via onboarding if still missing after Upstash restore",
  ];
  items.forEach((t, i) => {
    s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 1.2 + i * 1.15, w: 12.2, h: 1.0, fill: { color: i % 2 === 0 ? C.soft : "F7F8FA" }, rectRadius: 0.1 });
    s.addText(t, { x: 0.75, y: 1.4 + i * 1.15, w: 11.8, h: 0.65, fontFace: FONT, fontSize: 15, color: C.text });
  });
  footer(s, 2);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
