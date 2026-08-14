import { isSupabaseConfigured } from "@/lib/supabase";
import { loadAuthStore } from "@/lib/auth-store";
import {
  findTelegramLinkByCode,
  getConversation,
  appendMessage,
  createConversation,
  getAiPreferences,
  getTelegramLinkByChatId,
  listMessages,
  upsertTelegramLink,
} from "@/lib/ai/repository";
import { buildTrustedAiContext, sessionKeyForUser } from "@/lib/ai/context";
import { runAssistantTurn } from "@/lib/ai/run-turn";
import { assistantBotToken, sendAssistantTelegram } from "@/lib/ai/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function assistantToken(): string | null {
  return assistantBotToken();
}

function webhookSecret(): string | null {
  return process.env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET?.trim() || process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

const sendTelegram = sendAssistantTelegram;

/** Accepts both the typed command and the ?start=<code> deep link. */
function parseLinkCode(text: string): string | null {
  const match = /^\/(?:link|start)(?:@\w+)?\s+(\S+)$/i.exec(text);
  return match ? match[1] : null;
}

export async function POST(request: Request) {
  const secret = webhookSecret();
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }
  if (!assistantToken()) {
    return Response.json({ ok: true, ignored: "assistant bot not configured" });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const update = (await request.json().catch(() => null)) as {
    message?: {
      chat?: { id?: number | string };
      from?: { username?: string };
      text?: string;
    };
  } | null;
  const text = update?.message?.text?.trim();
  const chatId = update?.message?.chat?.id != null ? String(update.message.chat.id) : "";
  if (!text || !chatId) return Response.json({ ok: true });

  const linkCode = parseLinkCode(text);
  if (linkCode) {
    const row = await findTelegramLinkByCode(linkCode);
    if (!row) {
      await sendTelegram(chatId, "❌ Unknown or expired link code. Generate a new one in CRM → Settings → Integrations.");
      return Response.json({ ok: true });
    }
    const userId = String(row.user_id);
    await upsertTelegramLink({
      userId,
      chatId,
      username: update?.message?.from?.username ?? null,
    });
    const store = await loadAuthStore();
    const linkedUser = store.users.find((item) => item.id === userId);
    const who = linkedUser ? `${linkedUser.name} (${linkedUser.email})` : "your CRM account";
    await sendTelegram(
      chatId,
      `✅ Connected to ${who}.\nThis chat is now linked to Appli Assistant — same memory as the CRM. Ask me anything.`,
    );
    return Response.json({ ok: true });
  }

  if (/^\/start(@\w+)?$/i.test(text)) {
    const existing = await getTelegramLinkByChatId(chatId);
    await sendTelegram(
      chatId,
      existing
        ? "✅ This chat is already linked to Appli Assistant. Ask me anything."
        : "Not linked yet. Open CRM → Settings → Integrations, tap “Get link code”, then send me /link <code>.",
    );
    return Response.json({ ok: true });
  }

  const link = await getTelegramLinkByChatId(chatId);
  if (!link) {
    await sendTelegram(
      chatId,
      "This chat is not linked. Open CRM → Settings → Integrations, tap “Get link code”, then send me /link <code>.",
    );
    return Response.json({ ok: true });
  }
  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === String(link.user_id));
  if (!user || user.status !== "approved") {
    await sendTelegram(chatId, "Your CRM account is not approved.");
    return Response.json({ ok: true });
  }
  const permissions = store.rolePermissions[user.role];
  if (!permissions?.salesAiAssistant) {
    await sendTelegram(chatId, "You do not have Appli Assistant permission.");
    return Response.json({ ok: true });
  }

  const context = await buildTrustedAiContext(user);
  const prefs = await getAiPreferences(user.id);
  const conversations = await (await import("@/lib/ai/repository")).listConversations(user.id, 1);
  let conversation = conversations[0]
    ? await getConversation(conversations[0].id, user.id)
    : null;
  if (!conversation) {
    conversation = await createConversation({
      userId: user.id,
      sessionKey: sessionKeyForUser(user.id),
      title: text.slice(0, 80),
    });
  }
  const history = (await listMessages(conversation.id, user.id)).filter(
    (row) => row.role === "user" || row.role === "assistant",
  );
  await appendMessage({
    conversationId: conversation.id,
    userId: user.id,
    role: "user",
    content: text,
  });
  try {
    const result = await runAssistantTurn({
      context,
      prefs,
      history: history.map((row) => ({ role: row.role as "user" | "assistant", content: row.content })),
      userMessage: text,
      conversationId: conversation.id,
    });
    await appendMessage({
      conversationId: conversation.id,
      userId: user.id,
      role: "assistant",
      content: result.text,
      uiBlocks: result.uiBlocks,
    });
    await sendTelegram(chatId, result.text || "Done.");
  } catch (error) {
    await sendTelegram(chatId, error instanceof Error ? error.message : "Assistant failed.");
  }
  return Response.json({ ok: true });
}
