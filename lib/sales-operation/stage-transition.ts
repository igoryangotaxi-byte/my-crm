import { listSalesContacts } from "@/lib/sales-operation/contacts";
import { getSalesLeadById, updateSalesLead } from "@/lib/sales-operation/repository";
import {
  assertStageRequirements,
  assertValidStatusTransition,
  type StageMissingField,
  StageRequirementError,
  validateStageRequirements,
} from "@/lib/sales-operation/status-transitions";
import { createSalesTask } from "@/lib/sales-operation/tasks";
import type {
  CreateSalesTaskInput,
  SalesLead,
  SalesLeadStatus,
  UpdateSalesLeadInput,
} from "@/lib/sales-operation/types";
import { normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import { getSupabaseAdminClient } from "@/lib/supabase";

export type TransitionFollowUpInput = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
};

export type TransitionInput = {
  toStatus: SalesLeadStatus;
  fields?: UpdateSalesLeadInput;
  accountManagerUserId?: string | null;
  accountManagerName?: string | null;
  followUpTask?: TransitionFollowUpInput | null;
};

export type TransitionPreflightResult = {
  ok: boolean;
  missing: StageMissingField[];
  lead: SalesLead;
};

function hasReachableContact(
  lead: SalesLead,
  contacts: Array<{
    fullName: string;
    email: string | null;
    mobilePhone: string | null;
    officePhone: string | null;
    isActive: boolean;
  }>,
): boolean {
  const active = contacts.filter((c) => c.isActive);
  if (active.length > 0) {
    return active.some(
      (c) =>
        Boolean(c.fullName.trim()) &&
        Boolean(c.email?.trim() || c.mobilePhone?.trim() || c.officePhone?.trim()),
    );
  }
  // Legacy fallback: lead-level contact fields.
  return Boolean(
    lead.fullName.trim() && (lead.email?.trim() || lead.phone?.trim()),
  );
}

export async function preflightStageTransition(
  leadId: string,
  input: TransitionInput,
): Promise<TransitionPreflightResult> {
  const lead = await getSalesLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");

  const merged: SalesLead = {
    ...lead,
    estimatedMonthlyPotential:
      input.fields?.estimatedMonthlyPotential !== undefined
        ? input.fields.estimatedMonthlyPotential
        : lead.estimatedMonthlyPotential,
    pricingProposal:
      input.fields?.pricingProposal !== undefined
        ? input.fields.pricingProposal
        : lead.pricingProposal,
    pricingAmount:
      input.fields?.pricingAmount !== undefined
        ? input.fields.pricingAmount
        : lead.pricingAmount,
    contractNumber:
      input.fields?.contractNumber !== undefined
        ? input.fields.contractNumber
        : lead.contractNumber,
    corpClientId:
      input.fields?.corpClientId !== undefined
        ? input.fields.corpClientId
        : lead.corpClientId,
    fullName: input.fields?.fullName?.trim() || lead.fullName,
    email: input.fields?.email !== undefined ? input.fields.email : lead.email,
    phone: input.fields?.phone !== undefined ? input.fields.phone : lead.phone,
  };

  const contacts = await listSalesContacts(leadId);
  const missingKeys = validateStageRequirements(lead.status, input.toStatus, {
    estimatedMonthlyPotential: merged.estimatedMonthlyPotential,
    pricingProposal: merged.pricingProposal,
    contractNumber: merged.contractNumber,
    corpClientId: merged.corpClientId,
    hasContact: hasReachableContact(merged, contacts),
    followUpTaskProvided: Boolean(input.followUpTask?.title?.trim() || input.followUpTask),
    accountManagerUserId: input.accountManagerUserId,
  });

  return {
    ok: missingKeys.length === 0,
    missing: missingKeys.map((key) => ({
      key,
      label:
        key === "contact"
          ? "Client contact person & details"
          : key === "estimatedMonthlyPotential"
            ? "Monthly potential (₪)"
            : key === "pricingProposal"
              ? "Pricing / proposal sent to client"
              : key === "followUpTask"
                ? "Follow-up with client task"
                : key === "contractOrClientId"
                  ? "Contract number or Client ID"
                  : key === "accountManager"
                    ? "Account Manager"
                    : key,
    })),
    lead: merged,
  };
}

export async function transitionSalesLead(
  leadId: string,
  input: TransitionInput,
  actor: { userId: string | null; name: string },
): Promise<{ lead: SalesLead }> {
  const lead = await getSalesLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");

  assertValidStatusTransition(lead.status, input.toStatus);

  const contacts = await listSalesContacts(leadId);
  const fields = input.fields ?? {};
  const mergedPotential =
    fields.estimatedMonthlyPotential !== undefined
      ? fields.estimatedMonthlyPotential
      : lead.estimatedMonthlyPotential;
  const mergedProposal =
    fields.pricingProposal !== undefined ? fields.pricingProposal : lead.pricingProposal;
  const mergedContract =
    fields.contractNumber !== undefined ? fields.contractNumber : lead.contractNumber;
  const mergedCorp =
    fields.corpClientId !== undefined ? fields.corpClientId : lead.corpClientId;

  const draftLead: SalesLead = {
    ...lead,
    fullName: fields.fullName?.trim() || lead.fullName,
    email: fields.email !== undefined ? fields.email : lead.email,
    phone: fields.phone !== undefined ? fields.phone : lead.phone,
  };

  try {
    assertStageRequirements(lead.status, input.toStatus, {
      estimatedMonthlyPotential: mergedPotential,
      pricingProposal: mergedProposal,
      contractNumber: mergedContract,
      corpClientId: mergedCorp,
      hasContact: hasReachableContact(draftLead, contacts),
      followUpTaskProvided:
        input.toStatus === "negotiation"
          ? Boolean(input.followUpTask)
          : true,
      accountManagerUserId: input.accountManagerUserId,
    });
  } catch (error) {
    if (error instanceof StageRequirementError) throw error;
    throw error;
  }

  // If contact missing but lead fields provided in this payload, allow after merge check.
  // (Creating a full contact row is handled by the Modal calling contacts API first when needed.)

  const patch: UpdateSalesLeadInput = {
    ...fields,
    status: input.toStatus,
  };
  if (fields.corpClientId) {
    patch.corpClientId = normalizeCorpClientId(fields.corpClientId) || fields.corpClientId;
  }

  const updated = await updateSalesLead(leadId, patch, actor, {
    skipStageRequirements: true,
  });

  if (input.toStatus === "negotiation" && input.followUpTask) {
    const followUp: CreateSalesTaskInput = {
      title: input.followUpTask.title?.trim() || "Follow-up with client",
      description: input.followUpTask.description ?? null,
      dueAt: input.followUpTask.dueAt ?? null,
      taskType: "call",
      priority: "high",
      assignedToUserId:
        input.followUpTask.assignedToUserId || actor.userId || updated.assignedManagerUserId,
      assignedToName:
        input.followUpTask.assignedToName ||
        actor.name ||
        updated.assignedManagerName,
    };
    await createSalesTask(leadId, followUp, actor);
  }

  if (input.toStatus === "signed" && lead.status !== "signed") {
    await finalizeSignedTransition(updated, actor, {
      accountManagerUserId: input.accountManagerUserId ?? null,
      accountManagerName: input.accountManagerName ?? null,
      corpClientId: updated.corpClientId,
    });
  }

  return { lead: updated };
}

async function finalizeSignedTransition(
  lead: SalesLead,
  actor: { userId: string | null; name: string },
  opts: {
    accountManagerUserId: string | null;
    accountManagerName: string | null;
    corpClientId: string | null;
  },
): Promise<void> {
  // Client conversion + "Onboard Client" task already ran inside updateSalesLead.
  const supabase = getSupabaseAdminClient();
  const { data: clientRow } = await supabase
    .from("sales_clients")
    .select("id, corp_client_id")
    .eq("lead_id", lead.id)
    .maybeSingle();

  const corpId = opts.corpClientId
    ? normalizeCorpClientId(opts.corpClientId)
    : typeof clientRow?.corp_client_id === "string"
      ? normalizeCorpClientId(clientRow.corp_client_id)
      : "";

  if (clientRow && (corpId || opts.accountManagerUserId)) {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (corpId) payload.corp_client_id = corpId;
    const { error } = await supabase
      .from("sales_clients")
      .update(payload)
      .eq("id", clientRow.id);
    if (error) console.error("Failed to set corp_client_id on client:", error.message);

    if (corpId && opts.accountManagerUserId) {
      try {
        const { error: mapError } = await supabase.from("gp_corp_client_map").upsert(
          {
            corp_client_id: corpId,
            account_manager_user_id: opts.accountManagerUserId,
            account_manager_name: opts.accountManagerName || opts.accountManagerUserId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "corp_client_id" },
        );
        if (mapError) console.error("Failed to upsert AM on corp map:", mapError.message);
      } catch (err) {
        console.error("AM registry update failed:", err);
      }
    }
  }

  if (opts.accountManagerUserId) {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await createSalesTask(
        lead.id,
        {
          title: "First Client Call",
          description: "Initial onboarding call with the newly signed client.",
          taskType: "call",
          priority: "high",
          dueAt,
          assignedToUserId: opts.accountManagerUserId,
          assignedToName: opts.accountManagerName || opts.accountManagerUserId,
        },
        actor,
      );
    } catch (error) {
      console.error("First Client Call task failed:", error);
    }
  }
}
