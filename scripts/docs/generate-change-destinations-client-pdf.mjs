/**
 * Client-facing PDF: Change intermediate stops without cancelling the order.
 * Uses Appli / Yango CRM fonts (Yango Headline + Yango Text).
 *
 * Usage:
 *   node scripts/docs/generate-change-destinations-client-pdf.mjs
 *   node scripts/docs/generate-change-destinations-client-pdf.mjs ~/Desktop/out.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FONTS = path.join(ROOT, "public/fonts");
const DEFAULT_OUT = path.join(
  process.env.HOME || ROOT,
  "Desktop",
  "Appli-Taxi-CRM-Change-Intermediate-Stop.pdf",
);

const requireFromRoot = createRequire(path.join(ROOT, "package.json"));

function loadPdfkit() {
  try {
    return requireFromRoot("pdfkit");
  } catch {
    execSync("npm install pdfkit@0.17.1 --no-save", {
      cwd: ROOT,
      stdio: "inherit",
    });
    return requireFromRoot("pdfkit");
  }
}

const PDFDocument = loadPdfkit();

const INK = "#14161a";
const MUTED = "#6b7280";
const RULE = "#e9ebf0";
const ACCENT = "#ff2d2d";
const SURFACE = "#f7f8fa";
const OK = "#0f7a45";
const WARN = "#9a6700";

const outPath = path.resolve(process.argv[2] || DEFAULT_OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 48, bottom: 48, left: 48, right: 48 },
  info: {
    Title: "Appli Taxi CRM — Change intermediate stop without cancelling",
    Author: "Appli Taxi CRM",
    Subject: "Yango B2B change-destinations — operator guide",
    Keywords: "Yango, change-destinations, pre-order, intermediate stop, Appli CRM",
  },
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

doc.registerFont("YangoHeadline", path.join(FONTS, "yango-headline.ttf"));
doc.registerFont("YangoText", path.join(FONTS, "yango-text-rg.ttf"));
doc.registerFont("YangoTextMd", path.join(FONTS, "yango-text-md.ttf"));
doc.registerFont("YangoTextBd", path.join(FONTS, "yango-text-bd.ttf"));

const pageW = doc.page.width;
const left = doc.page.margins.left;
const contentW = pageW - doc.page.margins.left - doc.page.margins.right;

function ensure(space = 60) {
  if (doc.y + space > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function rule() {
  ensure(16);
  const y = doc.y + 4;
  doc
    .moveTo(left, y)
    .lineTo(left + contentW, y)
    .lineWidth(1)
    .strokeColor(RULE)
    .stroke();
  doc.y = y + 12;
}

function h1(text) {
  ensure(40);
  doc.font("YangoHeadline").fontSize(22).fillColor(INK).text(text, { width: contentW });
  doc.moveDown(0.35);
}

function h2(text) {
  ensure(36);
  doc.moveDown(0.4);
  doc.font("YangoTextBd").fontSize(13).fillColor(INK).text(text, { width: contentW });
  doc.moveDown(0.25);
}

function body(text) {
  ensure(28);
  doc.font("YangoText").fontSize(10).fillColor(INK).text(text, {
    width: contentW,
    lineGap: 2.5,
  });
  doc.moveDown(0.35);
}

function muted(text) {
  ensure(24);
  doc.font("YangoText").fontSize(9).fillColor(MUTED).text(text, {
    width: contentW,
    lineGap: 2,
  });
  doc.moveDown(0.3);
}

function bullet(text, color = INK) {
  ensure(22);
  const x = left;
  const bulletX = x;
  const textX = x + 12;
  const y = doc.y;
  doc.font("YangoTextBd").fontSize(10).fillColor(ACCENT).text("•", bulletX, y, { width: 10 });
  doc
    .font("YangoText")
    .fontSize(10)
    .fillColor(color)
    .text(text, textX, y, { width: contentW - 12, lineGap: 2 });
  doc.moveDown(0.15);
}

function statusPill(label, tone) {
  const colors =
    tone === "ok"
      ? { bg: "#e8f7ef", fg: OK }
      : tone === "warn"
        ? { bg: "#fff7e6", fg: WARN }
        : { bg: SURFACE, fg: MUTED };
  return { label, ...colors };
}

function drawScenarioCard({ title, when, result, note, tone }) {
  ensure(120);
  const pad = 12;
  const boxTop = doc.y;
  const pill = statusPill(result, tone);
  const textLeft = left + pad + 4;
  const textW = contentW - pad * 2 - 4;

  doc.font("YangoTextBd").fontSize(11).fillColor(INK).text(title, textLeft, boxTop + pad, {
    width: textW,
  });
  doc
    .font("YangoText")
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(when, textLeft, doc.y + 3, { width: textW, lineGap: 1.5 });
  doc
    .font("YangoTextMd")
    .fontSize(9.5)
    .fillColor(pill.fg)
    .text(`CRM behaviour: ${pill.label}`, textLeft, doc.y + 4, { width: textW });
  if (note) {
    doc
      .font("YangoText")
      .fontSize(9)
      .fillColor(INK)
      .text(note, textLeft, doc.y + 3, { width: textW, lineGap: 1.5 });
  }
  const boxBottom = doc.y + pad;
  doc
    .save()
    .roundedRect(left, boxTop, contentW, boxBottom - boxTop, 8)
    .lineWidth(1)
    .strokeColor(RULE)
    .stroke();
  doc.rect(left, boxTop, 3, boxBottom - boxTop).fill(ACCENT);
  doc.restore();
  doc.y = boxBottom + 10;
}

// ——— Header band ———
doc.rect(0, 0, pageW, 8).fill(ACCENT);
doc.moveDown(0.8);
doc.font("YangoTextMd").fontSize(9).fillColor(ACCENT).text("APPLI TAXI CRM", { characterSpacing: 1.2 });
doc.moveDown(0.2);
h1("Change an intermediate stop\nwithout cancelling the order");
muted(
  "Client guide · Yango B2B API “change-destinations” · Validated in Appli Taxi CRM (unit tests + product flow)",
);
muted(`Document date: ${new Date().toISOString().slice(0, 10)} · Audience: B2B operations / integration`);
rule();

h2("1. What this feature does");
body(
  "Appli Taxi CRM can update intermediate route points on an existing pre-order or scheduled order without cancelling it and without creating a new order. The CRM calls the official Yango Taxi Business API method change-destinations. The pickup (start) address cannot be changed with this method. Audio and driver assignment stay on the same order_id when Yango accepts the change.",
);
bullet("Official API: POST …/2.0/orders/change-destinations?order_id={order_id}");
bullet("Docs: https://taxi__business-api.docs-viewer.yandex.ru/en/concepts/api20/change-destinations");
bullet("CRM surfaces: Pre-Orders detail drawer and Request Rides → Scheduled ride card (Route editor).");

h2("2. API rules (from Yango documentation)");
bullet("You always send the full destinations list after the start: every intermediate stop + the final destination.");
bullet("Each point needs fullname and geopoint as [longitude, latitude].");
bullet("created_time (UTC with offset) is required. If another change used a later created_time, the API returns 409 — CRM retries once with a fresh timestamp.");
bullet("HTTP outcomes: 200 success · 400 invalid / not allowed · 403 client header · 404 order not found · 409 conflict.");
bullet("The published API description does not define a separate method for “driver assigned” vs “no driver”. The same change-destinations call is used in all cases. Whether a given trip status accepts the change is decided by Yango (often via 400 if the change is no longer allowed).");

h2("3. How Appli CRM implements it");
body(
  "Operators never need to cancel the trip first to attempt a stop change. The CRM loads the current route from orders/info, builds the new destinations tail, and posts change-destinations. If a driver is already assigned, the UI asks for confirmation (route updates for the driver; fare/ETA may change). On failure, the CRM shows the API error and does not auto-cancel the order.",
);
bullet("Edit an existing intermediate stop, or add a new intermediate stop before the final destination.");
bullet("Start and final stay visible; start is read-only (API limitation).");
bullet("Payload shaping is covered by automated CRM tests (parse route, patch interim, append interim, geopoint [lon, lat], created_time format).");

h2("4. Scenarios — no cancel required to attempt the change");

drawScenarioCard({
  title: "A. Pre-order / scheduled — no driver assigned",
  when: "Typical statuses: scheduled, pending, searching without a performer.",
  result: "Supported — change or add intermediate stop on the same order.",
  note: "Lowest risk. Same order_id and due_date are kept. Use Request Rides card or Pre-Orders → Route.",
  tone: "ok",
});

drawScenarioCard({
  title: "B. Driver assigned (not yet driving to the passenger)",
  when: "orders/info includes performer (name / phone / vehicle), trip still waiting or accepted.",
  result: "Supported via the same API — CRM shows a confirmation dialog first.",
  note: "No cancel. Driver keeps the same order; navigation should pick up the new stop after a successful 200.",
  tone: "ok",
});

drawScenarioCard({
  title: "C. Driver on the way to the client (driving / approaching pickup)",
  when: "Lifecycle similar to driving / going to pickup; performer present.",
  result: "Attempt without cancel. Success depends on Yango accepting the change for that status.",
  note: "If Yango returns 400, the CRM shows the error and leaves the order unchanged. Do not cancel unless operations explicitly chooses a separate cancel flow.",
  tone: "warn",
});

drawScenarioCard({
  title: "D. Driver with the client (transporting / trip in progress)",
  when: "Passenger on board; intermediate may already be ahead or already passed.",
  result: "Attempt without cancel. Yango may reject changes to stops already passed or late-route edits (400).",
  note: "CRM still uses change-destinations only — it does not cancel+recreate in this product version. Treat API errors as “not allowed for this trip state”.",
  tone: "warn",
});

h2("5. Operator steps in Appli Taxi CRM");
bullet("Open the order: Sales Operation → Request Rides (expand Scheduled ride) or Pre-Orders → open the order.");
bullet("In Route: review Start (read-only), Stop(s), Final.");
bullet("Edit an existing stop, or choose Add intermediate stop / Add another stop.");
bullet("Pick an address from suggestions (coordinates required), then Save / Add stop.");
bullet("If a driver is assigned, confirm the warning, then wait for success or the error message from Yango.");

h2("6. What we validated in CRM");
bullet("Unit tests for destination array shaping: parse source / interim / destination, patch one interim, append interim, [lon, lat] order, created_time format, terminal status helpers.");
bullet("Product flow: change-destinations is wired without a cancel step; 409 conflict is retried once; errors are shown to the operator.");
bullet("Live acceptance of a change for statuses C–D is determined by the Yango PBX/API response for that order — the CRM does not invent a second protocol.");

h2("7. Out of scope in this release");
bullet("Changing the start/pickup point via this API (not supported by Yango change-destinations).");
bullet("Automatic cancel + recreate when change-destinations fails.");
bullet("Editing the final destination alone as a separate product action (possible via the same API payload, not exposed as a dedicated control yet).");

rule();
muted(
  "Appli Taxi CRM · applitaxi.space · Based on Yango Taxi Business API change-destinations and Appli CRM implementation. This guide is for client operations and does not replace Yango’s official API reference.",
);

doc.end();

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});

console.log(`Wrote ${outPath}`);
