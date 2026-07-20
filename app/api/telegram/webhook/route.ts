import { isSupabaseConfigured } from "@/lib/supabase";
import { createNotification } from "@/lib/sales-operation/notifications";
import {
  getFeedbackRequestById,
  updateFeedbackStatus,
} from "@/lib/feedback/repository";
import {
  feedbackStatusKeyboard,
  formatFeedbackTelegramMessage,
  parseFeedbackCallbackData,
} from "@/lib/feedback/telegram-format";
import { feedbackStatusLabel } from "@/lib/feedback/types";
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  getTelegramWebhookSecret,
} from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number; username?: string; first_name?: string };
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
      text?: string;
    };
  };
};

export async function POST(request: Request) {
  const secret = getTelegramWebhookSecret();
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
  const callback = update?.callback_query;
  if (!callback?.id || !callback.data) {
    // Acknowledge non-callback updates so Telegram does not retry.
    return Response.json({ ok: true });
  }

  const parsed = parseFeedbackCallbackData(callback.data);
  if (!parsed) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callback.id,
      text: "Unknown action",
    }).catch(() => null);
    return Response.json({ ok: true });
  }

  try {
    const existing = await getFeedbackRequestById(parsed.feedbackId);
    if (!existing) {
      await answerTelegramCallbackQuery({
        callbackQueryId: callback.id,
        text: "Feedback not found",
      }).catch(() => null);
      return Response.json({ ok: true });
    }

    const updated =
      existing.status === parsed.status
        ? existing
        : await updateFeedbackStatus(parsed.feedbackId, parsed.status);

    const chatId = callback.message?.chat?.id ?? updated.telegramChatId;
    const messageId = callback.message?.message_id ?? updated.telegramMessageId;
    if (chatId != null && messageId != null) {
      await editTelegramMessage({
        chatId,
        messageId,
        text: formatFeedbackTelegramMessage(updated),
        replyMarkup: feedbackStatusKeyboard(updated.id),
      }).catch((error) => {
        console.error("Failed to edit Telegram feedback message:", error);
      });
    }

    if (existing.status !== parsed.status) {
      await createNotification({
        userId: updated.createdByUserId,
        type: "system",
        title: `Feedback: ${feedbackStatusLabel(updated.status)}`,
        body: updated.title,
        link: updated.pathname || "/",
      });
    }

    await answerTelegramCallbackQuery({
      callbackQueryId: callback.id,
      text: `Status → ${feedbackStatusLabel(updated.status)}`,
    }).catch(() => null);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram feedback webhook failed:", error);
    await answerTelegramCallbackQuery({
      callbackQueryId: callback.id,
      text: "Failed to update status",
    }).catch(() => null);
    return Response.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
