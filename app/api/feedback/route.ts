import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  countUnseenFeedbackStatusUpdates,
  createFeedbackRequest,
  listMyFeedbackRequests,
  updateFeedbackTelegramMeta,
} from "@/lib/feedback/repository";
import {
  formatFeedbackTelegramMessage,
  feedbackStatusKeyboard,
} from "@/lib/feedback/telegram-format";
import { getFeedbackChatId, sendTelegramMessage } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const [items, unseenStatusCount] = await Promise.all([
      listMyFeedbackRequests(auth.user.id),
      countUnseenFeedbackStatusUpdates(auth.user.id),
    ]);
    return Response.json(
      { ok: true, items, unseenStatusCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load feedback." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    pathname?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const pathname = typeof body?.pathname === "string" ? body.pathname.trim() : null;

  if (!title || title.length > 200) {
    return Response.json(
      { ok: false, error: "Title is required (max 200 characters)." },
      { status: 400 },
    );
  }
  if (!description || description.length > 4000) {
    return Response.json(
      { ok: false, error: "Description is required (max 4000 characters)." },
      { status: 400 },
    );
  }

  try {
    const feedback = await createFeedbackRequest({
      title,
      description,
      pathname,
      createdByUserId: auth.user.id,
      createdByName: auth.user.name,
      createdByEmail: auth.user.email,
      createdByRole: auth.user.role,
    });

    const chatId = getFeedbackChatId();
    const message = await sendTelegramMessage({
      chatId,
      text: formatFeedbackTelegramMessage(feedback),
      replyMarkup: feedbackStatusKeyboard(feedback.id),
    });

    await updateFeedbackTelegramMeta(feedback.id, {
      telegramChatId: String(message.chat.id),
      telegramMessageId: message.message_id,
    });

    return Response.json({ ok: true, feedback: { ...feedback, telegramMessageId: message.message_id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit feedback.";
    const status = message.includes("TELEGRAM_") ? 503 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
