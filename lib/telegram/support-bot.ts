/**
 * Telegram Support bot — public ticket intake into Tracker To Do.
 * Env: TELEGRAM_SUPPORT_BOT_TOKEN, TELEGRAM_SUPPORT_WEBHOOK_SECRET
 */

type TelegramApiResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export function getSupportBotToken(): string | null {
  return process.env.TELEGRAM_SUPPORT_BOT_TOKEN?.trim() || null;
}

export function requireSupportBotToken(): string {
  const token = getSupportBotToken();
  if (!token) throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN is not configured.");
  return token;
}

export function getSupportWebhookSecret(): string | null {
  return process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET?.trim() || null;
}

export type SupportInlineButton = {
  text: string;
  callback_data: string;
};

export type SupportTelegramMessage = {
  message_id: number;
  chat: { id: number | string };
};

async function supportTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = requireSupportBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TelegramApiResult<T>;
  if (!res.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description || `Telegram API ${method} failed.`);
  }
  return data.result;
}

export async function sendSupportTelegramMessage(input: {
  chatId: string | number;
  text: string;
  replyMarkup?: { inline_keyboard: SupportInlineButton[][] };
}): Promise<SupportTelegramMessage> {
  return supportTelegramApi<SupportTelegramMessage>("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function editSupportTelegramMessage(input: {
  chatId: string | number;
  messageId: number;
  text: string;
  replyMarkup?: { inline_keyboard: SupportInlineButton[][] };
}): Promise<SupportTelegramMessage> {
  return supportTelegramApi<SupportTelegramMessage>("editMessageText", {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function answerSupportCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
}): Promise<boolean> {
  return supportTelegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: false,
  });
}

export function escapeSupportHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
