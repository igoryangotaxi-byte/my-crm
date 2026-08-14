import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getCalendarTokens, isGoogleCalendarConfigured } from "@/lib/google/calendar";
import { deleteGmailTokens, getGmailTokens, isGmailOAuthConfigured } from "@/lib/ai/gmail";
import { deleteTelegramLink, getTelegramLink } from "@/lib/ai/repository";
import { assistantBotToken, getAssistantBotUsername } from "@/lib/ai/telegram-bot";
import { isEmailSendingConfigured } from "@/lib/sales-operation/email-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function telegramStatus(link: Record<string, unknown> | null) {
  const chatId = link?.telegram_chat_id ? String(link.telegram_chat_id) : "";
  const connected = Boolean(chatId) && !chatId.startsWith("pending:");
  return {
    configured: Boolean(assistantBotToken()),
    connected,
    username: (link?.telegram_username as string | null) ?? null,
    chatId: connected ? chatId : null,
    linkedAt: connected ? ((link?.linked_at as string | null) ?? null) : null,
    /** Set while a code was issued but the user has not messaged the bot yet. */
    pendingCode: !connected ? ((link?.link_code as string | null) ?? null) : null,
  };
}

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const [calendar, gmail, telegram, botUsername] = await Promise.all([
    getCalendarTokens(auth.user.id).catch(() => null),
    getGmailTokens(auth.user.id).catch(() => null),
    getTelegramLink(auth.user.id).catch(() => null),
    getAssistantBotUsername().catch(() => null),
  ]);
  return Response.json({
    ok: true,
    googleCalendar: {
      configured: isGoogleCalendarConfigured(),
      connected: Boolean(calendar),
      connectUrl: "/api/google/calendar/connect",
    },
    gmail: {
      configured: isGmailOAuthConfigured(),
      connected: Boolean(gmail),
      email: gmail?.email ?? null,
      connectUrl: "/api/ai/integrations/gmail/connect",
    },
    telegram: { ...telegramStatus(telegram), botUsername },
    smtp: { configured: isEmailSendingConfigured() },
  });
}

export async function DELETE(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (provider === "gmail") {
    await deleteGmailTokens(auth.user.id);
    return Response.json({ ok: true });
  }
  if (provider === "telegram") {
    await deleteTelegramLink(auth.user.id);
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: "Unknown provider." }, { status: 400 });
}
