import { createNotification } from "@/lib/sales-operation/notifications";
import { loadAuthStore } from "@/lib/auth-store";
import {
  listDueReminders,
  listEnabledNotificationRules,
  markReminderDelivered,
} from "@/lib/ai/repository";
import { deliverBriefing } from "@/lib/ai/briefings";
import { getTelegramLink } from "@/lib/ai/repository";

function hourInTz(timeZone: string): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(new Date()),
  );
  return Number.isFinite(hour) ? hour : new Date().getUTCHours();
}

function shouldFireCron(cronExpr: string | null, timeZone: string): boolean {
  if (!cronExpr) return false;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minute, hour] = parts;
  const now = new Date();
  const localHour = hourInTz(timeZone);
  const localMinute = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, minute: "2-digit" }).format(now),
  );
  const hourOk = hour === "*" || Number(hour) === localHour;
  const minuteOk = minute === "*" || Number(minute) === localMinute;
  return hourOk && minuteOk;
}

export async function runAiCronTick(): Promise<{ reminders: number; rules: number }> {
  const nowIso = new Date().toISOString();
  const due = await listDueReminders(nowIso).catch(() => []);
  let reminders = 0;
  for (const row of due as Array<Record<string, unknown>>) {
    const userId = String(row.user_id ?? "");
    const body = String(row.body ?? "");
    if (!userId || !body) continue;
    await createNotification({
      userId,
      type: "system",
      title: "Reminder",
      body,
      link: "/sales-operation/pipeline",
    });
    const channels = Array.isArray(row.channels) ? row.channels.map(String) : [];
    if (channels.includes("telegram")) {
      const link = await getTelegramLink(userId).catch(() => null);
      const token =
        process.env.TELEGRAM_ASSISTANT_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
      const chatId = link?.telegram_chat_id ? String(link.telegram_chat_id) : "";
      if (token && chatId && !chatId.startsWith("pending:")) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `Reminder: ${body}` }),
        }).catch(() => null);
      }
    }
    await markReminderDelivered(String(row.id));
    reminders += 1;
  }

  const store = await loadAuthStore();
  const rules = await listEnabledNotificationRules().catch(() => []);
  let fired = 0;
  for (const row of rules as Array<Record<string, unknown>>) {
    const userId = String(row.user_id ?? "");
    const user = store.users.find((item) => item.id === userId);
    if (!user) continue;
    const kind = String(row.kind ?? "");
    const cronExpr = typeof row.cron_expr === "string" ? row.cron_expr : null;
    if (cronExpr && !shouldFireCron(cronExpr, "Asia/Jerusalem")) continue;
    if (kind.includes("briefing")) {
      await deliverBriefing(userId, user.email, kind.replaceAll("_", " "));
      fired += 1;
    }
  }

  return { reminders, rules: fired };
}
