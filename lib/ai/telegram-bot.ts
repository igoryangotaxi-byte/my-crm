/** The bot that owns the assistant webhook. Linking must point at this exact bot. */
export function assistantBotToken(): string | null {
  return process.env.TELEGRAM_ASSISTANT_BOT_TOKEN?.trim() || null;
}

/** Outbound-only fallback: reuse the CRM bot when no dedicated assistant bot exists. */
export function assistantSendToken(): string | null {
  return assistantBotToken() || process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

let cachedUsername: { token: string; username: string | null } | null = null;

export async function getAssistantBotUsername(): Promise<string | null> {
  const token = assistantSendToken();
  if (!token) return null;
  if (cachedUsername?.token === token) return cachedUsername.username;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    const username = data.ok ? data.result?.username ?? null : null;
    cachedUsername = { token, username };
    return username;
  } catch {
    return null;
  }
}

export function assistantBotDeepLink(username: string | null, code: string): string | null {
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

export async function sendAssistantTelegram(chatId: string, text: string): Promise<void> {
  const token = assistantSendToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900), disable_web_page_preview: true }),
  });
}
