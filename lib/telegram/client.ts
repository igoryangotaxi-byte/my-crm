type TelegramApiResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  return token;
}

export function getFeedbackChatId(): string {
  const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID?.trim();
  if (!chatId) throw new Error("TELEGRAM_FEEDBACK_CHAT_ID is not configured.");
  return chatId;
}

export function getTelegramWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

async function telegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = getBotToken();
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

export type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number | string };
};

export async function sendTelegramMessage(input: {
  chatId: string | number;
  text: string;
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
}): Promise<TelegramMessage> {
  return telegramApi<TelegramMessage>("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function editTelegramMessage(input: {
  chatId: string | number;
  messageId: number;
  text: string;
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
}): Promise<TelegramMessage> {
  return telegramApi<TelegramMessage>("editMessageText", {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function answerTelegramCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
}): Promise<boolean> {
  return telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: false,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
