import {
  findMatchingTriggers,
  pickRoundRobinUser,
  readAssignData,
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
};

async function executeAutomation(
  automation: SalesAutomation,
  lead: SalesLead,
  fromStatus: SalesLeadStatus,
  toStatus: SalesLeadStatus,
  deps: Required<Pick<EngineDeps, "sendSms" | "assignManager" | "updateRoundRobin">>,
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

          await deps.assignManager(lead.id, {
            userId,
            name: userName?.trim() || userId,
          });
          steps.push({
            nodeId: node.id,
            type: "actionAssignManager",
            ok: true,
            message: `Assigned ${userName || userId}`,
          });
        } catch (error) {
          steps.push({
            nodeId: node.id,
            type: "actionAssignManager",
            ok: false,
            message: error instanceof Error ? error.message : "Assign failed",
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
