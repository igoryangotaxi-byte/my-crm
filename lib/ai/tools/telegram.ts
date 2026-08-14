import { getTelegramLink } from "@/lib/ai/repository";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

function assistantToken(): string | null {
  return process.env.TELEGRAM_ASSISTANT_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export async function telegramSend(run: ToolRun): Promise<AiToolResult> {
  const token = assistantToken();
  if (!token) {
    return { ok: false, error: "Telegram assistant bot is not configured." };
  }
  const text = String(run.args.text ?? "").trim();
  if (!text) return { ok: false, error: "text is required" };
  const link = await getTelegramLink(run.userId);
  const chatId = String(run.args.chatId ?? link?.telegram_chat_id ?? "");
  if (!chatId || chatId.startsWith("pending:")) {
    return {
      ok: false,
      error: "Telegram is not linked.",
      uiBlocks: [{ type: "connect", integration: "telegram", text: "Link Telegram in Settings → Integrations." }],
    };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!data.ok) return { ok: false, error: data.description ?? "Telegram send failed." };
  return { ok: true, data: { messageId: data.result?.message_id }, userMessage: "Telegram message sent." };
}
