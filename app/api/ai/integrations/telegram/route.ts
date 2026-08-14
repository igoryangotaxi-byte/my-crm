import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { setTelegramLinkCode } from "@/lib/ai/repository";
import {
  assistantBotDeepLink,
  assistantBotToken,
  getAssistantBotUsername,
} from "@/lib/ai/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  if (!assistantBotToken()) {
    return Response.json(
      { ok: false, error: "Telegram assistant bot is not configured (TELEGRAM_ASSISTANT_BOT_TOKEN)." },
      { status: 400 },
    );
  }
  const code = `appli-${auth.user.id.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`;
  await setTelegramLinkCode(auth.user.id, code);
  const botUsername = await getAssistantBotUsername();
  return Response.json({
    ok: true,
    code,
    botUsername,
    deepLink: assistantBotDeepLink(botUsername, code),
    instruction: botUsername
      ? `Open @${botUsername} and send: /link ${code}`
      : `Open the Appli Assistant Telegram bot and send: /link ${code}`,
  });
}
