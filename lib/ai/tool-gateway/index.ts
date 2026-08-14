import { loadAuthStore } from "@/lib/auth-store";
import type { AppPageKey } from "@/types/auth";
import type { AiToolResult, AiTrustedContext, AiUserPreferences } from "@/lib/ai/types";
import { getToolSpec } from "@/lib/ai/tool-defs";
import { isDeniedHostTool, redactParams, requiresConfirmation, riskForTool } from "@/lib/ai/risk-policy";
import {
  createConfirmation,
  createReminder,
  getIdempotentResult,
  getWorkspaceUsageThisMonth,
  saveIdempotentResult,
  writeAiAction,
} from "@/lib/ai/repository";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";
import { crmGetEntity, crmSearch, crmUpdateLeadStatus } from "@/lib/ai/tools/crm";
import {
  tasksAssign,
  tasksComment,
  tasksCreate,
  tasksGet,
  tasksSearch,
  tasksUpdate,
} from "@/lib/ai/tools/tasks";
import { peopleGet, peopleSearch, peopleWorkload } from "@/lib/ai/tools/people";
import {
  trackerArchiveTicket,
  trackerAssignTicket,
  trackerCommentTicket,
  trackerCreateQueue,
  trackerCreateTicket,
  trackerDeleteTicket,
  trackerGetTicket,
  trackerListQueues,
  trackerListTickets,
  trackerUpdateTicket,
} from "@/lib/ai/tools/tracker";
import {
  calendarAnalyzeLoad,
  calendarCancelEvent,
  calendarCreateEvent,
  calendarFindSlots,
  calendarGetEvents,
  calendarGetFreeBusy,
  calendarUpdateEvent,
} from "@/lib/ai/tools/calendar";
import {
  analyticsBreakdown,
  analyticsCompare,
  analyticsDetectAnomaly,
  analyticsQueryMetric,
  analyticsTimeseries,
} from "@/lib/ai/tools/analytics";
import { mailCreateDraft, mailRead, mailSearch, mailSend, mailSummarize } from "@/lib/ai/tools/mail";
import {
  notificationsCancel,
  notificationsCreate,
  notificationsList,
  notificationsSchedule,
} from "@/lib/ai/tools/notifications";
import { telegramSend } from "@/lib/ai/tools/telegram";

const HANDLERS: Record<string, (run: ToolRun) => Promise<AiToolResult>> = {
  "crm.search": crmSearch,
  "crm.get_entity": crmGetEntity,
  "crm.update_lead_status": crmUpdateLeadStatus,
  "tasks.search": tasksSearch,
  "tasks.get": tasksGet,
  "tasks.create": tasksCreate,
  "tasks.update": tasksUpdate,
  "tasks.assign": tasksAssign,
  "tasks.comment": tasksComment,
  "tracker.list_queues": trackerListQueues,
  "tracker.create_queue": trackerCreateQueue,
  "tracker.list_tickets": trackerListTickets,
  "tracker.get_ticket": trackerGetTicket,
  "tracker.create_ticket": trackerCreateTicket,
  "tracker.update_ticket": trackerUpdateTicket,
  "tracker.assign_ticket": trackerAssignTicket,
  "tracker.comment_ticket": trackerCommentTicket,
  "tracker.archive_ticket": trackerArchiveTicket,
  "tracker.delete_ticket": trackerDeleteTicket,
  "people.search": peopleSearch,
  "people.get": peopleGet,
  "people.workload": peopleWorkload,
  "calendar.get_events": calendarGetEvents,
  "calendar.get_free_busy": calendarGetFreeBusy,
  "calendar.find_slots": calendarFindSlots,
  "calendar.analyze_load": calendarAnalyzeLoad,
  "calendar.create_event": calendarCreateEvent,
  "calendar.update_event": calendarUpdateEvent,
  "calendar.cancel_event": calendarCancelEvent,
  "analytics.query_metric": analyticsQueryMetric,
  "analytics.compare": analyticsCompare,
  "analytics.get_timeseries": analyticsTimeseries,
  "analytics.breakdown": analyticsBreakdown,
  "analytics.detect_anomaly": analyticsDetectAnomaly,
  "mail.search": mailSearch,
  "mail.read": mailRead,
  "mail.summarize": mailSummarize,
  "mail.create_draft": mailCreateDraft,
  "mail.send": mailSend,
  "notifications.create": notificationsCreate,
  "notifications.schedule": notificationsSchedule,
  "notifications.list": notificationsList,
  "notifications.cancel": notificationsCancel,
  "telegram.send": telegramSend,
  "reminders.create": async (run) => {
    const id = await createReminder({
      userId: run.userId,
      body: String(run.args.body ?? ""),
      dueAt: String(run.args.dueAt ?? ""),
    });
    return { ok: true, data: { id }, userMessage: "Reminder saved." };
  },
};

function hasPage(permissions: Record<AppPageKey, boolean>, required: AppPageKey | AppPageKey[]) {
  const keys = Array.isArray(required) ? required : [required];
  return keys.some((key) => permissions[key]);
}

export async function executeAiTool(input: {
  tool: string;
  args: Record<string, unknown>;
  context: AiTrustedContext;
  prefs: AiUserPreferences;
  conversationId?: string | null;
  confirmed?: boolean;
  idempotencyKey?: string | null;
}): Promise<AiToolResult> {
  const started = Date.now();
  const tool = input.tool.includes(".") ? input.tool : input.tool.replace("_", ".");
  if (isDeniedHostTool(tool)) {
    return { ok: false, status: "denied", error: "This host tool is disabled for Appli Assistant." };
  }
  const spec = getToolSpec(tool);
  if (!spec || !HANDLERS[spec.name]) {
    return { ok: false, error: `Unknown tool: ${tool}` };
  }
  if (!input.context.permissions.salesAiAssistant) {
    return { ok: false, status: "denied", error: "You do not have access to Appli Assistant." };
  }
  if (!hasPage(input.context.permissions, spec.requiredPage)) {
    return { ok: false, status: "denied", error: `Missing permission for ${spec.name}.` };
  }

  const risk = spec.risk ?? riskForTool(spec.name);
  if (risk >= 1) {
    const budget = Number(process.env.AI_MONTHLY_BUDGET_USD ?? "0");
    if (budget > 0) {
      const spent = await getWorkspaceUsageThisMonth().catch(() => 0);
      if (spent >= budget) {
        return {
          ok: false,
          error: "Monthly AI budget reached. Writes are paused; reads still work.",
        };
      }
    }
  }
  const needsConfirm = requiresConfirmation({
    risk,
    autoLowRiskWrites: input.prefs.autoLowRiskWrites,
    allowDirectSendEmail: input.prefs.allowDirectSendEmail,
    allowDirectSendTelegram: input.prefs.allowDirectSendTelegram,
    tool: spec.name,
  });
  if (needsConfirm && !input.confirmed) {
    const preview = {
      tool: spec.name,
      args: redactParams(input.args),
      title: spec.name,
      body: JSON.stringify(redactParams(input.args)),
    };
    const token = await createConfirmation({
      userId: input.context.userId,
      tool: spec.name,
      args: input.args,
      preview,
    });
    const result: AiToolResult = {
      ok: true,
      status: "needs_confirmation",
      confirmToken: token,
      preview,
      uiBlocks: [
        {
          type: "confirmation",
          token,
          title: spec.name.replace(".", " · "),
          body: describePreview(spec.name, input.args),
          tool: spec.name,
        },
      ],
      userMessage: "This action needs your confirmation.",
    };
    await writeAiAction({
      userId: input.context.userId,
      conversationId: input.conversationId,
      tool: spec.name,
      action: "preview",
      paramsRedacted: redactParams(input.args),
      resultStatus: "needs_confirmation",
      approvalState: "pending",
      latencyMs: Date.now() - started,
    });
    return result;
  }

  if (input.idempotencyKey) {
    const cached = await getIdempotentResult(input.context.userId, input.idempotencyKey).catch(() => null);
    if (cached) return cached as AiToolResult;
  }

  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === input.context.userId);
  const run: ToolRun = {
    userId: input.context.userId,
    userName: user?.name ?? input.context.userName,
    userEmail: user?.email ?? input.context.userEmail,
    role: input.context.role,
    args: input.args,
    confirmed: input.confirmed,
  };

  try {
    const result = await HANDLERS[spec.name](run);
    await writeAiAction({
      userId: input.context.userId,
      conversationId: input.conversationId,
      tool: spec.name,
      action: spec.name.split(".")[1] ?? spec.name,
      paramsRedacted: redactParams(input.args),
      resultStatus: result.ok ? result.status ?? "ok" : "error",
      approvalState: input.confirmed ? "approved" : "none",
      latencyMs: Date.now() - started,
      error: result.error ?? null,
    });
    if (input.idempotencyKey && result.ok && result.status !== "needs_confirmation") {
      await saveIdempotentResult(input.context.userId, input.idempotencyKey, spec.name, result).catch(() => null);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed.";
    await writeAiAction({
      userId: input.context.userId,
      conversationId: input.conversationId,
      tool: spec.name,
      action: spec.name.split(".")[1] ?? spec.name,
      paramsRedacted: redactParams(input.args),
      resultStatus: "error",
      approvalState: input.confirmed ? "approved" : "none",
      latencyMs: Date.now() - started,
      error: message,
    });
    return { ok: false, error: message };
  }
}

function describePreview(tool: string, args: Record<string, unknown>): string {
  if (tool === "mail.send") return `Send email to ${args.to}: ${args.subject}`;
  if (tool === "telegram.send") return `Send Telegram: ${String(args.text ?? "").slice(0, 180)}`;
  if (tool === "calendar.create_event") {
    return `Create “${args.title}” ${args.startsAt} – ${args.endsAt}`;
  }
  if (tool === "calendar.cancel_event") return `Cancel event ${args.eventId}`;
  if (tool === "crm.update_lead_status") {
    return `Move lead ${args.leadId ?? args.leadQuery} to ${args.status}`;
  }
  if (tool === "tracker.delete_ticket") {
    return `Permanently delete tracker ticket ${args.ticketId ?? args.ticketQuery}, with its comments and checklist`;
  }
  return Object.entries(args)
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");
}
