import { createNotification } from "@/lib/sales-operation/notifications";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  createReminder,
  listUserNotificationRules,
  upsertNotificationRule,
} from "@/lib/ai/repository";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

export async function notificationsCreate(run: ToolRun): Promise<AiToolResult> {
  await createNotification({
    userId: run.userId,
    type: "system",
    title: String(run.args.title ?? "Appli"),
    body: String(run.args.body ?? "") || null,
    link: "/sales-operation/pipeline",
  });
  return { ok: true, userMessage: "In-app notification created." };
}

export async function notificationsSchedule(run: ToolRun): Promise<AiToolResult> {
  const kind = String(run.args.kind ?? "reminder");
  if (kind === "reminder") {
    const dueAt = String(run.args.fireAt ?? run.args.dueAt ?? "");
    if (!dueAt) return { ok: false, error: "fireAt/dueAt is required for reminders" };
    const id = await createReminder({
      userId: run.userId,
      body: String(run.args.body ?? "Reminder"),
      dueAt,
      channels: Array.isArray(run.args.channels) ? run.args.channels.map(String) : ["in_app"],
    });
    return { ok: true, data: { id }, userMessage: "Reminder scheduled." };
  }
  const id = await upsertNotificationRule({
    userId: run.userId,
    kind,
    cronExpr: typeof run.args.cronExpr === "string" ? run.args.cronExpr : defaultCron(kind),
    fireAt: typeof run.args.fireAt === "string" ? run.args.fireAt : null,
    channels: Array.isArray(run.args.channels) ? run.args.channels.map(String) : ["in_app"],
    payload: { body: run.args.body ?? null },
  });
  return { ok: true, data: { id }, userMessage: `Scheduled ${kind}.` };
}

export async function notificationsList(run: ToolRun): Promise<AiToolResult> {
  const rules = await listUserNotificationRules(run.userId);
  return { ok: true, data: rules };
}

export async function notificationsCancel(run: ToolRun): Promise<AiToolResult> {
  const id = String(run.args.id ?? "");
  const kind = String(run.args.kind ?? "rule");
  const supabase = getSupabaseAdminClient();
  if (kind === "reminder") {
    await supabase.from("ai_reminders").delete().eq("id", id).eq("user_id", run.userId);
  } else {
    await supabase.from("ai_notification_rules").update({ enabled: false }).eq("id", id).eq("user_id", run.userId);
  }
  return { ok: true, userMessage: "Cancelled." };
}

function defaultCron(kind: string): string {
  if (kind === "morning_briefing") return "0 7 * * *";
  if (kind === "tomorrow_briefing") return "0 18 * * *";
  if (kind === "weekly_briefing") return "0 16 * * 5";
  return "0 8 * * *";
}
