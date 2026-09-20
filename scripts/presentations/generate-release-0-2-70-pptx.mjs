/**
 * Release 0.2.70 deck: Astradial telephony engine in Appli HUB.
 * Usage: node scripts/presentations/generate-release-0-2-70-pptx.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import PptxGenJS from "pptxgenjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const ASSETS = join(ROOT, "docs/presentations/assets");
const OUT_REPO = join(ROOT, "docs/presentations/Yango-Sales-Operations-Astradial-Telephony-0-2-70.pptx");
const OUT_DESKTOP = join(homedir(), "Desktop/Yango-Sales-Operations-Astradial-Telephony-0-2-70.pptx");
const C = { accent: "FF2D2D", text: "14161A", muted: "6B7280", muted2: "8A919E", white: "FFFFFF", soft: "FFF1F1" };
const FONT = "Arial";
const logo = existsSync(join(ASSETS, "yango-logo.png")) ? join(ASSETS, "yango-logo.png") : null;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.title = "Yango Sales Operations — Astradial Telephony (0.2.70)";
pptx.lang = "en-US";

function base() {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.accent }, line: { color: C.accent } });
  return s;
}
function footer(s, page) {
  s.addText("Yango · Sales Operations · Release 0.2.70 · Confidential", {
    x: 0.55,
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
  s.addText("RELEASE 0.2.70", { x: 0.55, y: 2.1, w: 12, h: 0.35, fontFace: FONT, fontSize: 14, color: C.accent, bold: true });
  s.addText("Astradial telephony in Appli", { x: 0.55, y: 2.55, w: 12, h: 0.8, fontFace: FONT, fontSize: 32, color: C.text, bold: true });
  s.addText("HUB Astradial page, click-to-call, screen-pop, recordings + Whisper summarize. 3CX stays.", {
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
    "HUB → Astradial: link SIP extension, dial any number, recent calls",
    "TelephonyProvider abstraction — Astradial behind kill switch TELEPHONY_ENABLED",
    "HMAC webhooks → telephony_calls + screen-pop; recording auth proxy",
    "Summarize: recording → Whisper → short CRM bullets (OPENAI)",
    "Driver Dial prefers Astradial when NEXT_PUBLIC_TELEPHONY_ENABLED",
    "Needs ASTRADIAL_API_URL pointing at a live PBX (not on Vercel); SQL already applied",
  ];
  bullets.forEach((line, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.05 + i * 0.85,
      w: 12.2,
      h: 0.72,
      fill: { color: i % 2 === 0 ? C.soft : "F7F8FA" },
      line: { color: "EEEEEE" },
      rectRadius: 0.08,
    });
    s.addText(line, {
      x: 0.75,
      y: 1.18 + i * 0.85,
      w: 11.8,
      h: 0.5,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
    });
  });
  footer(s, 2);
}
{
  const s = base();
  s.addText("Ops checklist", { x: 0.55, y: 0.45, w: 12, h: 0.4, fontFace: FONT, fontSize: 22, color: C.text, bold: true });
  const ops = [
    ["Env live", "TELEPHONY_ENABLED, NEXT_PUBLIC_TELEPHONY_ENABLED, TELEPHONY_PROVIDER, ASTRADIAL_API_KEY, WEBHOOK_SECRET"],
    ["Still needed", "ASTRADIAL_API_URL → VPS with Astradial + SIP trunk (Asterisk cannot run on Vercel)"],
    ["Webhook", "https://applitaxi.space/api/telephony/webhooks/astradial"],
    ["SQL", "scripts/sql/supabase_telephony_astradial.sql (applied)"],
    ["RBAC", "salesAstradial (permissions v17)"],
  ];
  ops.forEach((row, i) => {
    s.addText(row[0], { x: 0.55, y: 1.2 + i * 0.9, w: 2.4, h: 0.5, fontFace: FONT, fontSize: 14, color: C.accent, bold: true });
    s.addText(row[1], { x: 3.1, y: 1.2 + i * 0.9, w: 9.5, h: 0.7, fontFace: FONT, fontSize: 14, color: C.text });
  });
  footer(s, 3);
}

mkdirSync(dirname(OUT_REPO), { recursive: true });
await pptx.writeFile({ fileName: OUT_REPO });
copyFileSync(OUT_REPO, OUT_DESKTOP);
console.log("Wrote", OUT_REPO);
console.log("Copied", OUT_DESKTOP);
