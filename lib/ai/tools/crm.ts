import { globalSearch } from "@/lib/sales-operation/search-service";
import {
  getSalesClientById,
  getSalesClientByLeadId,
  getSalesLeadById,
  listSalesClientNotes,
  listSalesClients,
  listSalesLeadNotes,
} from "@/lib/sales-operation/repository";
import { listSalesContacts } from "@/lib/sales-operation/contacts";
import { listSalesTasks } from "@/lib/sales-operation/tasks";
import type { SalesClient } from "@/lib/sales-operation/types";
import {
  preflightStageTransition,
  transitionSalesLead,
  type TransitionInput,
} from "@/lib/sales-operation/stage-transition";
import { isValidStatusTransition } from "@/lib/sales-operation/status-transitions";
import type { SalesLead } from "@/lib/sales-operation/types";
import { describeLeadStatuses, leadStatusLabel, resolveLeadStatus } from "@/lib/ai/crm-status";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

function publicLead(lead: Awaited<ReturnType<typeof getSalesLeadById>>) {
  if (!lead) return null;
  return {
    id: lead.id,
    fullName: lead.fullName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    status: lead.status,
    assignedManagerUserId: lead.assignedManagerUserId,
    campaignName: lead.campaignName,
    source: lead.source,
  };
}

export async function crmSearch(run: ToolRun): Promise<AiToolResult> {
  const query = String(run.args.query ?? "").trim();
  if (!query) return { ok: false, error: "query is required" };
  const limit = Math.min(20, Number(run.args.limit ?? 8) || 8);
  const results = await globalSearch(query, limit);
  return {
    ok: true,
    data: results.map((item) => ({
      type: item.entityType,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      href: item.href,
    })),
    userMessage: results.length ? `Found ${results.length} CRM matches.` : "No CRM matches.",
  };
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** "+972 52-123-4567" and "0521234567" must find the same record. */
function phoneDigits(value: string): string | null {
  const digits = value.replace(/\D+/g, "");
  const looksLikePhone = /^[+\d][\d\s()+.-]{5,}$/.test(value.trim());
  return looksLikePhone && digits.length >= 6 ? digits : null;
}

async function leadProfile(leadId: string, signed: SalesClient | null) {
  const lead = await getSalesLeadById(leadId);
  if (!lead) return null;
  const [contacts, tasks, notes] = await Promise.all([
    listSalesContacts(lead.id).catch(() => []),
    listSalesTasks(lead.id).catch(() => []),
    listSalesLeadNotes(lead.id).catch(() => []),
  ]);
  return {
    kind: "lead" as const,
    id: lead.id,
    status: lead.status,
    statusLabel: leadStatusLabel(lead.status),
    statusSince: lead.statusEnteredAt,
    archived: lead.isArchived,
    company: {
      name: lead.companyName,
      legalName: lead.legalName,
      regNumber: lead.companyRegNumber,
      website: lead.website,
      address: lead.clientAddress,
      segment: lead.segmentId,
      subSegment: lead.subSegment,
      employees: lead.employeesCount,
    },
    person: { fullName: lead.fullName, email: lead.email, phone: lead.phone },
    deal: {
      estimatedMonthlyPotential: lead.estimatedMonthlyPotential,
      estimatedMonthlyTrips: lead.estimatedMonthlyTrips,
      pricingProposal: lead.pricingProposal,
      pricingAmount: lead.pricingAmount,
      expectedCloseDate: lead.expectedCloseDate,
      contractNumber: lead.contractNumber,
      corpClientId: lead.corpClientId,
    },
    owner: {
      managerUserId: lead.assignedManagerUserId,
      managerName: lead.assignedManagerName,
    },
    origin: {
      source: lead.source,
      campaign: lead.campaignName,
      ad: lead.adName,
    },
    contacts: contacts.map((contact) => ({
      name: contact.fullName,
      jobTitle: contact.jobTitle,
      email: contact.email,
      mobile: contact.mobilePhone,
      office: contact.officePhone,
      primary: contact.isPrimary,
    })),
    openTasks: tasks
      .filter((task) => task.status === "open")
      .slice(0, 10)
      .map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        assignedToName: task.assignedToName,
      })),
    recentNotes: notes.slice(0, 5).map((note) => ({
      author: note.authorName,
      body: note.body,
      createdAt: note.createdAt,
    })),
    signedClient: signed
      ? {
          id: signed.id,
          corpClientId: signed.corpClientId,
          corpClientName: signed.corpClientName,
          accountManagerName: signed.accountManagerName,
          salesManagerName: signed.salesManagerName,
          signedAt: signed.signedAt,
          url: `/sales-operation/b2b-clients/${signed.id}`,
        }
      : null,
    generalNotes: lead.generalNotes,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    url: `/sales-operation/pipeline?lead=${lead.id}`,
  };
}

export async function crmLookup(run: ToolRun): Promise<AiToolResult> {
  const query = String(run.args.query ?? "").trim();
  if (!query) return { ok: false, error: "query is required" };

  let lead = await getSalesLeadById(query).catch(() => null);
  let signed: SalesClient | null = null;

  if (lead) {
    signed = await getSalesClientByLeadId(lead.id).catch(() => null);
  } else {
    signed = await getSalesClientById(query).catch(() => null);
    if (!signed) {
      const wanted = norm(query);
      const clients = await listSalesClients().catch(() => []);
      signed =
        clients.find((client) => norm(client.corpClientId ?? "") === wanted) ??
        clients.find((client) => norm(client.corpClientName ?? "") === wanted) ??
        null;
    }
    if (signed) lead = await getSalesLeadById(signed.leadId).catch(() => null);
  }

  if (!lead && !signed) {
    const digits = phoneDigits(query);
    let matches = await globalSearch(query, 12);
    if (matches.length === 0 && digits) matches = await globalSearch(digits, 12);
    const entities = matches.filter((item) => item.entityType !== "contact");
    const pool = entities.length > 0 ? entities : matches;
    if (pool.length === 0) {
      return {
        ok: true,
        data: { found: false, query, candidates: [] },
        userMessage: `Nothing in the CRM matches “${query}” — not an id, phone, email, company or name.`,
      };
    }
    if (pool.length > 1) {
      return {
        ok: true,
        data: {
          found: false,
          query,
          candidates: pool.slice(0, 8).map((item) => ({
            type: item.entityType,
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
          })),
        },
        userMessage: `“${query}” matches ${pool.length} records: ${pool
          .slice(0, 5)
          .map((item) => `${item.title} (${item.entityType} ${item.id})`)
          .join("; ")}. Ask which one, or call again with the id.`,
      };
    }
    const hit = pool[0];
    if (hit.entityType === "client") {
      signed = await getSalesClientById(hit.id).catch(() => null);
      if (signed) lead = await getSalesLeadById(signed.leadId).catch(() => null);
    } else {
      lead = await getSalesLeadById(hit.id).catch(() => null);
      if (lead) signed = await getSalesClientByLeadId(lead.id).catch(() => null);
    }
  }

  if (lead) {
    const profile = await leadProfile(lead.id, signed);
    if (!profile) return { ok: false, error: `Lead ${lead.id} disappeared while reading it.` };
    const headline = [
      profile.company.name || profile.person.fullName,
      profile.statusLabel,
      profile.owner.managerName ? `manager ${profile.owner.managerName}` : null,
      profile.deal.estimatedMonthlyPotential
        ? `potential ₪${profile.deal.estimatedMonthlyPotential.toLocaleString("en-US")}/mo`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      ok: true,
      data: { found: true, ...profile },
      uiBlocks: [{ type: "status", text: headline }],
      userMessage: headline,
    };
  }

  if (signed) {
    const notes = await listSalesClientNotes(signed.id).catch(() => []);
    return {
      ok: true,
      data: {
        found: true,
        kind: "client",
        id: signed.id,
        leadId: signed.leadId,
        person: { fullName: signed.fullName, email: signed.email, phone: signed.phone },
        company: { name: signed.companyName },
        corpClientId: signed.corpClientId,
        corpClientName: signed.corpClientName,
        accountManagerName: signed.accountManagerName,
        salesManagerName: signed.salesManagerName,
        signedAt: signed.signedAt,
        recentNotes: notes.slice(0, 5).map((note) => ({
          author: note.authorName,
          body: note.body,
          createdAt: note.createdAt,
        })),
        url: `/sales-operation/b2b-clients/${signed.id}`,
      },
      userMessage: `${signed.companyName || signed.fullName} — signed client${
        signed.corpClientId ? `, corp id ${signed.corpClientId}` : ""
      }.`,
    };
  }

  return {
    ok: true,
    data: { found: false, query, candidates: [] },
    userMessage: `Nothing in the CRM matches “${query}”.`,
  };
}

export async function crmGetEntity(run: ToolRun): Promise<AiToolResult> {
  const id = String(run.args.id ?? "");
  const entityType = String(run.args.entityType ?? "lead");
  if (entityType === "client") {
    const client = await getSalesClientById(id);
    if (!client) return { ok: false, error: "Client not found." };
    return {
      ok: true,
      data: {
        id: client.id,
        fullName: client.fullName,
        companyName: client.companyName,
        email: client.email,
        phone: client.phone,
        corpClientId: client.corpClientId,
      },
    };
  }
  const lead = await getSalesLeadById(id);
  if (!lead) return { ok: false, error: "Lead not found." };
  return { ok: true, data: publicLead(lead) };
}

async function resolveLead(
  run: ToolRun,
): Promise<{ lead: SalesLead } | { error: AiToolResult }> {
  const leadId = String(run.args.leadId ?? "").trim();
  if (leadId) {
    const lead = await getSalesLeadById(leadId);
    if (!lead) return { error: { ok: false, error: `Lead ${leadId} not found.` } };
    return { lead };
  }
  const query = String(run.args.leadQuery ?? "").trim();
  if (!query) return { error: { ok: false, error: "leadId or leadQuery is required." } };
  const matches = (await globalSearch(query, 10)).filter((item) => item.entityType === "lead");
  if (matches.length === 0) {
    return { error: { ok: false, error: `No lead matches “${query}”.` } };
  }
  if (matches.length > 1) {
    const options = matches.slice(0, 5).map((item) => `${item.title} (${item.id})`).join("; ");
    return {
      error: {
        ok: false,
        error: `“${query}” matches ${matches.length} leads: ${options}. Ask the user which one, then pass leadId.`,
      },
    };
  }
  const lead = await getSalesLeadById(matches[0].id);
  if (!lead) return { error: { ok: false, error: `Lead ${matches[0].id} not found.` } };
  return { lead };
}

function optionalNumber(value: unknown): number | undefined {
  const num = Number(value);
  return typeof value === "number" || (typeof value === "string" && value.trim() && Number.isFinite(num))
    ? num
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function crmUpdateLeadStatus(run: ToolRun): Promise<AiToolResult> {
  const resolved = await resolveLead(run);
  if ("error" in resolved) return resolved.error;
  const lead = resolved.lead;

  const status = resolveLeadStatus(run.args.status);
  if (!status) {
    return {
      ok: false,
      error: `Unknown status “${String(run.args.status ?? "")}”. Valid statuses: ${describeLeadStatuses()}.`,
    };
  }
  if (lead.status === status) {
    return {
      ok: true,
      data: { leadId: lead.id, status },
      userMessage: `“${lead.companyName || lead.fullName}” is already in ${leadStatusLabel(status)}.`,
    };
  }
  if (!isValidStatusTransition(lead.status, status)) {
    return {
      ok: false,
      error: `Cannot move from ${leadStatusLabel(lead.status)} to ${leadStatusLabel(status)}. This transition is blocked by the pipeline rules.`,
    };
  }

  const fields: TransitionInput["fields"] = {};
  const potential = optionalNumber(run.args.estimatedMonthlyPotential);
  if (potential !== undefined) fields.estimatedMonthlyPotential = potential;
  const pricingProposal = optionalString(run.args.pricingProposal);
  if (pricingProposal) fields.pricingProposal = pricingProposal;
  const corpClientId = optionalString(run.args.corpClientId);
  if (corpClientId) fields.corpClientId = corpClientId;

  const followUp = run.args.followUpTask;
  const followUpTitle =
    followUp && typeof followUp === "object"
      ? optionalString((followUp as Record<string, unknown>).title)
      : undefined;
  const input: TransitionInput = {
    toStatus: status,
    fields: Object.keys(fields).length > 0 ? fields : undefined,
    accountManagerUserId: optionalString(run.args.accountManagerUserId) ?? null,
    followUpTask: followUpTitle
      ? {
          title: followUpTitle,
          dueAt: optionalString((followUp as Record<string, unknown>).dueAt) ?? null,
          assignedToUserId: run.userId,
          assignedToName: run.userName,
        }
      : null,
  };

  const preflight = await preflightStageTransition(lead.id, input);
  if (!preflight.ok) {
    const missing = preflight.missing.map((field) => field.label).join(", ");
    const message = `Cannot move “${lead.companyName || lead.fullName}” to ${leadStatusLabel(status)} yet — the pipeline requires: ${missing}. Ask the user for these values and call the tool again with them.`;
    return {
      ok: false,
      status: "denied",
      error: message,
      data: { leadId: lead.id, missing: preflight.missing },
      userMessage: message,
    };
  }

  const result = await transitionSalesLead(lead.id, input, {
    userId: run.userId,
    name: run.userName,
  });
  return {
    ok: true,
    data: { leadId: result.lead.id, from: lead.status, to: result.lead.status },
    uiBlocks: [
      {
        type: "status",
        text: `${result.lead.companyName || result.lead.fullName}: ${leadStatusLabel(lead.status)} → ${leadStatusLabel(result.lead.status)}`,
      },
    ],
    userMessage: `Moved “${result.lead.companyName || result.lead.fullName}” to ${leadStatusLabel(result.lead.status)}.`,
  };
}
