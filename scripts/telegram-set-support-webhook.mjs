/**
 * Register the Telegram webhook for the public Support ticket bot.
 *
 * Usage:
 *   TELEGRAM_SUPPORT_BOT_TOKEN=... TELEGRAM_SUPPORT_WEBHOOK_SECRET=... \
 *   TELEGRAM_SUPPORT_WEBHOOK_URL=https://applitaxi.space/api/telegram/support/webhook \
 *   node scripts/telegram-set-support-webhook.mjs
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const token = process.env.TELEGRAM_SUPPORT_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN is required.");
  }

  const url =
    process.env.TELEGRAM_SUPPORT_WEBHOOK_URL?.trim() ||
    "https://applitaxi.space/api/telegram/support/webhook";
  const secret = process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET?.trim() || "";

  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((res) => res.json());
  if (!me.ok) throw new Error(me.description || "getMe failed");

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
      ...(secret ? { secret_token: secret } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || "setWebhook failed");
  }

  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) =>
    r.json(),
  );
  console.log(`Support bot: @${me.result.username}`);
  console.log(`Webhook set: ${url}`);
  console.log(`Secret token: ${secret ? "configured" : "MISSING (webhook is unauthenticated)"}`);
  console.log(`Pending updates: ${info.result?.pending_update_count ?? 0}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
