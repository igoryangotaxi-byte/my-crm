/**
 * Send a release announcement (+ optional PPTX) to the Telegram release chat.
 *
 * Usage:
 *   node scripts/telegram-send-release.mjs \
 *     --version 0.2.47 \
 *     --title "Sales Operation Tracker" \
 *     --feature "Multi-project kanban boards" \
 *     --feature "Ticket drawer with @mentions" \
 *     --feature "My Space + Calendar sync" \
 *     --pptx docs/presentations/Yango-Sales-Operations-Tracker-0-2-47.pptx \
 *     --url https://applitaxi.space/sales-operation/tracker
 *
 * Env (from .env.local):
 *   TELEGRAM_RELEASE_BOT_TOKEN  (fallback: TELEGRAM_BOT_TOKEN)
 *   TELEGRAM_RELEASE_CHAT_ID
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function parseArgs(argv) {
  const out = {
    version: null,
    title: null,
    features: [],
    pptx: null,
    url: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version") out.version = argv[++i];
    else if (a === "--title") out.title = argv[++i];
    else if (a === "--feature") out.features.push(argv[++i]);
    else if (a === "--pptx") out.pptx = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function buildCaption({ version, title, features, url }) {
  const lines = [
    `🚀 <b>Release ${escapeHtml(version)}</b> — ${escapeHtml(title)}`,
    "",
    "<b>What's new:</b>",
    ...features.map((f) => `• ${escapeHtml(f)}`),
  ];
  if (url) {
    lines.push("", `🔗 ${escapeHtml(url)}`);
  }
  lines.push("", "📎 Presentation with screenshots attached.");
  return lines.join("\n");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function telegramForm(token, method, form) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.version || !args.title || args.features.length === 0) {
    console.log(`Usage:
  node scripts/telegram-send-release.mjs \\
    --version 0.2.47 \\
    --title "Feature name" \\
    --feature "Short bullet" \\
    --feature "…" \\
    [--pptx path/to/deck.pptx] \\
    [--url https://…] \\
    [--dry-run]`);
    process.exit(args.help ? 0 : 1);
  }

  const token =
    process.env.TELEGRAM_RELEASE_BOT_TOKEN?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_RELEASE_CHAT_ID?.trim();
  if (!token) throw new Error("TELEGRAM_RELEASE_BOT_TOKEN (or TELEGRAM_BOT_TOKEN) is required.");
  if (!chatId) throw new Error("TELEGRAM_RELEASE_CHAT_ID is required.");

  const caption = buildCaption(args);
  console.log("--- caption ---\n" + caption.replace(/<\/?b>/g, "") + "\n---------------");

  if (args.dryRun) {
    console.log("Dry run — not sending.");
    return;
  }

  if (args.pptx) {
    const pptxPath = resolve(args.pptx);
    if (!existsSync(pptxPath)) throw new Error(`PPTX not found: ${pptxPath}`);

    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("caption", caption);
    form.set("parse_mode", "HTML");
    form.set(
      "document",
      new Blob([readFileSync(pptxPath)], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      basename(pptxPath),
    );
    // Node 20+ FormData + Blob works with fetch; also support stream fallback via File if needed
    const result = await telegramForm(token, "sendDocument", form);
    console.log(`Sent document message_id=${result.message_id}`);
    return;
  }

  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("text", caption);
  form.set("parse_mode", "HTML");
  form.set("disable_web_page_preview", "true");
  const result = await telegramForm(token, "sendMessage", form);
  console.log(`Sent message_id=${result.message_id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
