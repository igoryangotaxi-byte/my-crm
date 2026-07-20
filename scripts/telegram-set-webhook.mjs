/**
 * Register Telegram webhook for CRM feedback callbacks.
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   TELEGRAM_WEBHOOK_URL=https://applitaxi.space/api/telegram/webhook \
 *   node scripts/telegram-set-webhook.mjs
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  const url =
    process.env.TELEGRAM_WEBHOOK_URL?.trim() ||
    "https://applitaxi.space/api/telegram/webhook";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

  const body = {
    url,
    allowed_updates: ["callback_query"],
    drop_pending_updates: true,
    ...(secret ? { secret_token: secret } : {}),
  };

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || "setWebhook failed");
  }
  console.log(`Webhook set: ${url}`);
  if (secret) console.log("Secret token configured.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
