import {
  findMatchingTriggers,
  pickRoundRobinUser,
  readAssignData,
  readCreateTaskData,
  readSmsData,
  walkActionNodes,
} from "@/lib/sales-operation/automation/graph";
import {
  insertAutomationRun,
  listEnabledSalesAutomations,
  setLeadAssignedManager,
  updateAutomationRoundRobinState,
} from "@/lib/sales-operation/automation/repository";
import { applyAutomationTemplate, buildSmsTemplateVars } from "@/lib/sales-operation/automation/template";
import type {
  AutomationRunStep,
  SalesAutomation,
} from "@/lib/sales-operation/automation/types";
import { createNotification } from "@/lib/sales-operation/notifications";
import { createSalesTask } from "@/lib/sales-operation/tasks";
import type { SalesLead, SalesLeadStatus } from "@/lib/sales-operation/types";
import { sendInforuSms } from "@/lib/sms/inforu";

export function isInforuSmsSendEnabled(): boolean {
  const v = process.env.INFORU_SMS_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

type SmsSender = typeof sendInforuSms;

type EngineDeps = {
  sendSms?: SmsSender;
  listEnabled?: () => Promise<SalesAutomation[]>;
  insertRun?: typeof insertAutomationRun;
  assignManager?: typeof setLeadAssignedManager;
  updateRoundRobin?: typeof updateAutomationRoundRobinState;
  createTask?: typeof createSalesTask;
  notify?: typeof createNotification;
};

async function executeAutomation(
  automation: SalesAutomation,
  lead: SalesLead,
  fromStatus: SalesLeadStatus,
  toStatus: SalesLeadStatus,
  deps: Required<
    Pick<EngineDeps, "sendSms" | "assignManager" | "updateRoundRobin" | "createTask" | "notify">
  >,
): Promise<AutomationRunStep[]> {
  const triggers = findMatchingTriggers(automation.graph.nodes, fromStatus, toStatus);
  if (triggers.length === 0) return [];

  const steps: AutomationRunStep[] = [];
  let roundRobinState = { ...automation.roundRobinState };
  let roundRobinDirty = false;
  const vars = buildSmsTemplateVars({ ...lead, status: toStatus });

  for (const trigger of triggers) {
    const actions = walkActionNodes(automation.graph.nodes, automation.graph.edges, trigger.id);
    for (const node of actions) {
      if (node.type === "actionSms") {
        const { text } = readSmsData(node);
        if (!text.trim()) {
          steps.push({
            nodeId: node.id,
            type: "actionSms",
            ok: true,
            skipped: true,
            message: "Empty SMS text.",
          });
          continue;
        }
        if (!lead.phone?.trim()) {
          steps.push({
            nodeId: node.id,
            type: "actionSms",
            ok: true,
            skipped: true,
            message: "Lead has no phone.",
          });
          continue;
        }
        if (!isInforuSmsSendEnabled()) {
          steps.push({
            nodeId: node.id,
            type: "actionSms",
            ok: true,
            skipped: true,
            message: "INFORU_SMS_ENABLED is off.",
          });
          continue;
        }
        try {
          const body = applyAutomationTemplate(text, vars);
          const result = await deps.sendSms({
            phones: [lead.phone],
            text: body,
            customerMessageId: `sales-automation:${automation.id}:${lead.id}`,
          });
          steps.push({
            nodeId: node.id,
            type: "actionSms",
            ok: result.ok,
            message: result.ok
              ? `Sent (${result.numberOfRecipients})`
              : result.configError || result.description || "SMS failed",
          });
        } catch (error) {
          steps.push({
            nodeId: node.id,
            type: "actionSms",
            ok: false,
            message: error instanceof Error ? error.message : "SMS failed",
          });
        }
        continue;
      }

      if (node.type === "actionAssignManager") {
        const assign = readAssignData(node);
        try {
          let userId: string | undefined;
          let userName: string | undefined;

          if (assign.mode === "round_robin") {
            const ids = assign.userIds ?? [];
            const picked = pickRoundRobinUser(ids, roundRobinState[node.id] ?? 0);
            if (!picked) {
              steps.push({
                nodeId: node.id,
                type: "actionAssignManager",
                ok: false,
                message: "No managers configured for round robin.",
              });
              continue;
            }
            userId = picked.userId;
            userName = assign.userNames?.[userId] || userId;
            roundRobinState = { ...roundRobinState, [node.id]: picked.nextCursor };
            roundRobinDirty = true;
          } else {
            userId = assign.userId;
            userName = assign.userName || assign.userId;
          }

          if (!userId?.trim()) {
            steps.push({
              nodeId: node.id,
              type: "actionAssignManager",
              ok: false,
              message: "Manager is not configured.",
            });
            continue;
          }

          const resolvedName = userName?.trim() || userId;
          await deps.assignManager(lead.id, {
            userId,
            name: resolvedName,
          });
          await deps.notify({
            userId,
            type: "lead_assigned",
            title: `You were assigned a lead: ${lead.companyName || lead.fullName}`,
            leadId: lead.id,
            link: "/sales-operation/pipeline",
          });
          steps.push({
            nodeId: node.id,
            type: "actionAssignManager",
            ok: true,
            message: `Assigned ${resolvedName}`,
          });
        } catch (error) {
          steps.push({
            nodeId: node.id,
            type: "actionAssignManager",
            ok: false,
            message: error instanceof Error ? error.message : "Assign failed",
          });
        }
        continue;
      }

      if (node.type === "actionCreateTask") {
        const cfg = readCreateTaskData(node);
        const title = applyAutomationTemplate(cfg.title, vars).trim();
        if (!title) {
          steps.push({
            nodeId: node.id,
            type: "actionCreateTask",
            ok: true,
            skipped: true,
            message: "Empty task title.",
          });
          continue;
        }
        try {
          const dueAt = new Date(
            Date.now() + cfg.dueInDays * 24 * 60 * 60 * 1000,
          ).toISOString();
          const assignToOwner = cfg.assignToLeadOwner && Boolean(lead.assignedManagerUserId);
          await deps.createTask(
            lead.id,
            {
              title,
              taskType: cfg.taskType,
              priority: cfg.priority,
              dueAt,
              assignedToUserId: assignToOwner ? lead.assignedManagerUserId : null,
              assignedToName: assignToOwner ? lead.assignedManagerName : null,
            },
            { userId: null, name: automation.name },
          );
          steps.push({
            nodeId: node.id,
            type: "actionCreateTask",
            ok: true,
            message: `Created task “${title}”`,
          });
        } catch (error) {
          steps.push({
            nodeId: node.id,
            type: "actionCreateTask",
            ok: false,
            message: error instanceof Error ? error.message : "Create task failed",
          });
        }
      }
    }
  }

  if (roundRobinDirty) {
    try {
      await deps.updateRoundRobin(automation.id, roundRobinState);
    } catch (error) {
      console.error("Failed to persist round-robin state:", error);
    }
  }

  return steps;
}

function summarizeRunStatus(steps: AutomationRunStep[]): "ok" | "partial" | "error" {
  if (steps.length === 0) return "ok";
  const failed = steps.filter((step) => !step.ok && !step.skipped);
  const succeeded = steps.filter((step) => step.ok);
  if (failed.length === 0) return "ok";
  if (succeeded.length === 0) return "error";
  return "partial";
}

export async function runAutomationsForStatusChange(
  lead: SalesLead,
  fromStatus: SalesLeadStatus,
  toStatus: SalesLeadStatus,
  deps?: EngineDeps,
): Promise<void> {
  if (fromStatus === toStatus) return;

  const listEnabled = deps?.listEnabled ?? listEnabledSalesAutomations;
  const sendSms = deps?.sendSms ?? sendInforuSms;
  const insertRun = deps?.insertRun ?? insertAutomationRun;
  const assignManager = deps?.assignManager ?? setLeadAssignedManager;
  const updateRoundRobin = deps?.updateRoundRobin ?? updateAutomationRoundRobinState;
  const createTask = deps?.createTask ?? createSalesTask;
  const notify = deps?.notify ?? createNotification;

  let automations: SalesAutomation[];
  try {
    automations = await listEnabled();
  } catch (error) {
    console.error("Failed to load sales automations:", error);
    return;
  }

  for (const automation of automations) {
    try {
      const steps = await executeAutomation(automation, lead, fromStatus, toStatus, {
        sendSms,
        assignManager,
        updateRoundRobin,
        createTask,
        notify,
      });
      if (steps.length === 0) continue;
      await insertRun({
        automationId: automation.id,
        leadId: lead.id,
        fromStatus,
        toStatus,
        status: summarizeRunStatus(steps),
        steps,
      });
    } catch (error) {
      console.error(`Automation ${automation.id} failed:`, error);
      await insertRun({
        automationId: automation.id,
        leadId: lead.id,
        fromStatus,
        toStatus,
        status: "error",
        steps: [
          {
            nodeId: "engine",
            type: "engine",
            ok: false,
            message: error instanceof Error ? error.message : "Automation failed",
          },
        ],
      });
    }
  }
}
