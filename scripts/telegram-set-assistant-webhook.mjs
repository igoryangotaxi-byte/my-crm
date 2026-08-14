/**
 * Register the Telegram webhook for the Appli Assistant bot.
 *
 * The assistant bot is a different bot from the CRM feedback bot, so it needs its
 * own webhook pointing at /api/ai/telegram/webhook.
 *
 * Usage:
 *   TELEGRAM_ASSISTANT_BOT_TOKEN=... TELEGRAM_ASSISTANT_WEBHOOK_SECRET=... \
 *   TELEGRAM_ASSISTANT_WEBHOOK_URL=https://applitaxi.space/api/ai/telegram/webhook \
 *   node scripts/telegram-set-assistant-webhook.mjs
 *
 * Pending updates are kept on purpose: a /link message sent before the webhook
 * existed is still delivered and completes the linking.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const token = process.env.TELEGRAM_ASSISTANT_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_ASSISTANT_BOT_TOKEN is required.");
  }

  const url =
    process.env.TELEGRAM_ASSISTANT_WEBHOOK_URL?.trim() ||
    "https://applitaxi.space/api/ai/telegram/webhook";
  const secret =
    process.env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET?.trim() ||
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    "";

  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((res) => res.json());
  if (!me.ok) throw new Error(me.description || "getMe failed");

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      allowed_updates: ["message"],
      ...(secret ? { secret_token: secret } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || "setWebhook failed");
  }

  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
  console.log(`Assistant bot: @${me.result.username}`);
  console.log(`Webhook set: ${url}`);
  console.log(`Secret token: ${secret ? "configured" : "MISSING (webhook is unauthenticated)"}`);
  console.log(`Pending updates: ${info.result?.pending_update_count ?? 0}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
