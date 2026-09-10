import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupportTrackerTicket } from "@/lib/telegram/support-create-ticket";
import {
  answerSupportCallbackQuery,
  editSupportTelegramMessage,
  getSupportBotToken,
  getSupportWebhookSecret,
  sendSupportTelegramMessage,
} from "@/lib/telegram/support-bot";
import {
  SUPPORT_CB_OPEN,
  askDescriptionText,
  chooseTitleText,
  needTitleFirstText,
  parseSupportTitleCallback,
  selectTitleKeyboard,
  supportTitleById,
  ticketCreatedText,
  titleOptionsKeyboard,
  welcomeSupportText,
} from "@/lib/telegram/support-flow";
import {
  clearSupportSession,
  getSupportSession,
  upsertSupportSession,
} from "@/lib/telegram/support-sessions";
import { MAX_PUBLIC_DESCRIPTION_CHARS } from "@/lib/sales-operation/public-ticket-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TgUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramUpdate = {
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string };
    from?: TgUser;
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: TgUser;
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
      text?: string;
    };
  };
};

function displayName(user?: TgUser | null): string | null {
  if (!user) return null;
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function chatIdString(chatId: number | string | undefined | null): string | null {
  if (chatId === undefined || chatId === null) return null;
  return String(chatId);
}

export async function POST(request: Request) {
  if (!getSupportBotToken()) {
    return Response.json({ ok: false, error: "Support bot is not configured." }, { status: 503 });
  }

  const secret = getSupportWebhookSecret();
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;

  try {
    if (update?.callback_query?.id) {
      await handleCallback(update.callback_query);
      return Response.json({ ok: true });
    }

    if (update?.message?.chat?.id != null) {
      await handleMessage(update.message);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("telegram support webhook:", error);
    // Acknowledge so Telegram does not retry forever.
    return Response.json({ ok: true });
  }
}

async function handleCallback(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = chatIdString(callback.message?.chat?.id);
  const messageId = callback.message?.message_id;
  const data = callback.data ?? "";

  if (!chatId) {
    await answerSupportCallbackQuery({ callbackQueryId: callback.id }).catch(() => null);
    return;
  }

  const from = callback.from;
  const userMeta = {
    telegramUserId: from?.id != null ? String(from.id) : null,
    telegramUsername: from?.username ?? null,
    telegramName: displayName(from),
  };

  if (data === SUPPORT_CB_OPEN) {
    await answerSupportCallbackQuery({ callbackQueryId: callback.id, text: "Choose a title" }).catch(
      () => null,
    );
    if (messageId != null) {
      await editSupportTelegramMessage({
        chatId,
        messageId,
        text: chooseTitleText(),
        replyMarkup: titleOptionsKeyboard(),
      }).catch(async () => {
        await sendSupportTelegramMessage({
          chatId,
          text: chooseTitleText(),
          replyMarkup: titleOptionsKeyboard(),
        });
      });
    } else {
      await sendSupportTelegramMessage({
        chatId,
        text: chooseTitleText(),
        replyMarkup: titleOptionsKeyboard(),
      });
    }
    return;
  }

  const titleId = parseSupportTitleCallback(data);
  if (titleId) {
    const title = supportTitleById(titleId);
    if (!title) {
      await answerSupportCallbackQuery({ callbackQueryId: callback.id, text: "Unknown title" });
      return;
    }
    await upsertSupportSession({
      chatId,
      step: "awaiting_description",
      title,
      ...userMeta,
    });
    await answerSupportCallbackQuery({ callbackQueryId: callback.id, text: title }).catch(() => null);
    if (messageId != null) {
      await editSupportTelegramMessage({
        chatId,
        messageId,
        text: askDescriptionText(title),
      }).catch(async () => {
        await sendSupportTelegramMessage({ chatId, text: askDescriptionText(title) });
      });
    } else {
      await sendSupportTelegramMessage({ chatId, text: askDescriptionText(title) });
    }
    return;
  }

  await answerSupportCallbackQuery({ callbackQueryId: callback.id, text: "Unknown action" }).catch(
    () => null,
  );
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = chatIdString(message.chat?.id);
  if (!chatId) return;

  const text = typeof message.text === "string" ? message.text.trim() : "";
  const from = message.from;
  const userMeta = {
    telegramUserId: from?.id != null ? String(from.id) : null,
    telegramUsername: from?.username ?? null,
    telegramName: displayName(from),
  };

  if (!text) {
    await sendSupportTelegramMessage({
      chatId,
      text: "Please send a text description.",
      replyMarkup: selectTitleKeyboard(),
    });
    return;
  }

  if (text === "/start" || text === "/help") {
    await clearSupportSession(chatId).catch(() => null);
    await sendSupportTelegramMessage({
      chatId,
      text: welcomeSupportText(),
      replyMarkup: selectTitleKeyboard(),
    });
    return;
  }

  if (text === "/cancel") {
    await clearSupportSession(chatId);
    await sendSupportTelegramMessage({
      chatId,
      text: "Cancelled. Tap the button when you want to submit a new request.",
      replyMarkup: selectTitleKeyboard(),
    });
    return;
  }

  const session = await getSupportSession(chatId);
  if (!session || session.step !== "awaiting_description" || !session.title) {
    await sendSupportTelegramMessage({
      chatId,
      text: needTitleFirstText(),
      replyMarkup: selectTitleKeyboard(),
    });
    return;
  }

  if (text.length > MAX_PUBLIC_DESCRIPTION_CHARS) {
    await sendSupportTelegramMessage({
      chatId,
      text: `Description is too long (max ${MAX_PUBLIC_DESCRIPTION_CHARS} characters). Please shorten it.`,
    });
    return;
  }

  const telegramUserId = userMeta.telegramUserId || session.telegramUserId || chatId;
  await createSupportTrackerTicket({
    title: session.title,
    description: text,
    telegramUserId,
    telegramUsername: userMeta.telegramUsername || session.telegramUsername,
    telegramName: userMeta.telegramName || session.telegramName,
  });

  await clearSupportSession(chatId);
  await sendSupportTelegramMessage({
    chatId,
    text: ticketCreatedText(session.title),
    replyMarkup: selectTitleKeyboard(),
  });
}
