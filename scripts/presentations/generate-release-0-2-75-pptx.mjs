/**
 * Release 0.2.75 deck: Settings Access tabs + per-user CRM stacks.
 * Usage: node scripts/presentations/generate-release-0-2-75-pptx.mjs
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
  "docs/presentations/Yango-Sales-Operations-Settings-Access-0-2-75.pptx",
);
const OUT_DESKTOP = join(
  homedir(),
  "Desktop/Yango-Sales-Operations-Settings-Access-0-2-75.pptx",
);
const C = { accent: "FF2D2D", text: "14161A", muted: "6B7280", muted2: "8A919E", white: "FFFFFF", soft: "FFF1F1" };
const FONT = "Arial";
const logo = existsSync(join(ASSETS, "yango-logo.png")) ? join(ASSETS, "yango-logo.png") : null;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Appli Taxi Oz · Sales Operations";
pptx.title = "Yango Sales Operations — Settings Access (0.2.75)";
pptx.lang = "en-US";

function base() {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.08,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
  return s;
}
function footer(s, page) {
  s.addText("Yango · Sales Operations · Release 0.2.75 · Confidential", {
    x: 0.55,
    y: 7.16,
    w: 10.5,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted2,
  });
  s.addText(`${page} / 3`, {
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
  const s = base();
  if (logo) s.addImage({ path: logo, x: 0.55, y: 0.4, w: 1.1, h: 0.4 });
  s.addText("RELEASE 0.2.75", {
    x: 0.55,
    y: 2.1,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: C.accent,
    bold: true,
  });
  s.addText("Settings: Access / Segments / Others", {
    x: 0.55,
    y: 2.55,
    w: 12,
    h: 0.8,
    fontFace: FONT,
    fontSize: 30,
    color: C.text,
    bold: true,
  });
  s.addText("Per-user CRM stacks, Active/Disabled, last login for Google SSO.", {
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
  s.addText("What's new", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 22,
    color: C.text,
    bold: true,
  });
  const bullets = [
    "Settings tabs: Access management · Business segments · Others (?tab=)",
    "Per-user CRM access stacks (My Space only / Grant all) — Admin always full",
    "User / Team Lead code defaults = My Space only; AM/SM baseline unchanged",
    "Active / Disabled + Last login (SSO writes crm_user_profiles.last_login_at)",
    "effectivePageAccess wired through client canAccess + SO API guards",
  ];
  bullets.forEach((line, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.1 + i * 0.95,
      w: 12.2,
      h: 0.82,
      fill: { color: i % 2 === 0 ? C.soft : "F7F8FA" },
      line: { color: "EEEEEE" },
      rectRadius: 0.08,
    });
    s.addText(line, {
      x: 0.75,
      y: 1.25 + i * 0.95,
      w: 11.8,
      h: 0.55,
      fontFace: FONT,
      fontSize: 14,
      color: C.text,
    });
  });
  footer(s, 2);
}
{
  const s = base();
  s.addText("Ops checklist", {
    x: 0.55,
    y: 0.45,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 22,
    color: C.text,
    bold: true,
  });
  const ops = [
    ["URL", "https://applitaxi.space/sales-operation/settings?tab=access"],
    ["SQL", "page_overrides + last_login_at on crm_user_profiles (applied)"],
    ["Note", "KV custom role grants not restored (Upstash quota); use Access stacks / code defaults"],
    ["RBAC", "Admin full; User/TL My Space; overrides win over role defaults"],
  ];
  ops.forEach((row, i) => {
    s.addText(row[0], {
      x: 0.55,
      y: 1.3 + i * 1.1,
      w: 2.2,
      h: 0.5,
      fontFace: FONT,
      fontSize: 14,
      color: C.accent,
      bold: true,
    });
    s.addText(row[1], {
      x: 2.9,
      y: 1.3 + i * 1.1,
      w: 9.7,
      h: 0.8,
      fontFace: FONT,
      fontSize: 14,
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
