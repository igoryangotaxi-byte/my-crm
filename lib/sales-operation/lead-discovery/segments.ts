import type {
  LeadDiscoveryRow,
  SegmentConditionGroup,
  SegmentConditionRule,
} from "@/lib/sales-operation/lead-discovery/types";
import {
  listDiscoveredLeads,
  updateDiscoverySegment,
} from "@/lib/sales-operation/lead-discovery/repository";
import { getSupabaseAdminClient } from "@/lib/supabase";

function isGroup(node: SegmentConditionRule | SegmentConditionGroup): node is SegmentConditionGroup {
  return "rules" in node && Array.isArray((node as SegmentConditionGroup).rules);
}

function fieldValue(row: LeadDiscoveryRow, field: string): unknown {
  const map: Record<string, unknown> = {
    country: row.country,
    city: row.city,
    category: row.googleCategory,
    companySize: row.employeeSizeEstimate,
    sizeConfidence: row.employeeSizeConfidence,
    taxiPotentialScore: row.taxiPotentialScore,
    qualification: row.qualificationStatus,
    source: row.source,
    campaign: row.campaignId,
    emailAvailability: Boolean(
      (row.enrichment as { hasEmail?: boolean })?.hasEmail ??
        row.confirmedSignals.some((s) => s.signal === "public_email"),
    ),
    phoneAvailability: row.confirmedSignals.some((s) => s.signal === "public_phone"),
    website: row.website,
    works24_7: row.confirmedSignals.some((s) => s.signal === "works_24_7"),
    doNotContact: row.doNotContact,
    requiresManualReview: row.requiresManualReview,
  };
  return map[field];
}

function matchRule(row: LeadDiscoveryRow, rule: SegmentConditionRule): boolean {
  const value = fieldValue(row, rule.field);
  switch (rule.op) {
    case "exists":
      return value != null && value !== "" && value !== false;
    case "not_exists":
      return value == null || value === "" || value === false;
    case "eq":
      return value === rule.value;
    case "neq":
      return value !== rule.value;
    case "gte":
      return Number(value) >= Number(rule.value);
    case "lte":
      return Number(value) <= Number(rule.value);
    case "gt":
      return Number(value) > Number(rule.value);
    case "lt":
      return Number(value) < Number(rule.value);
    case "contains":
      return String(value ?? "")
        .toLowerCase()
        .includes(String(rule.value ?? "").toLowerCase());
    case "in":
      return Array.isArray(rule.value) && rule.value.map(String).includes(String(value));
    default:
      return false;
  }
}

export function evaluateSegmentConditions(
  row: LeadDiscoveryRow,
  group: SegmentConditionGroup,
): boolean {
  if (!group.rules.length) return false;
  const results = group.rules.map((node) =>
    isGroup(node) ? evaluateSegmentConditions(row, node) : matchRule(row, node),
  );
  return group.op === "and" ? results.every(Boolean) : results.some(Boolean);
}

export async function recalculateSegment(segmentId: string, conditions: SegmentConditionGroup) {
  const leads = await listDiscoveredLeads(500);
  const matched = leads.filter((l) => evaluateSegmentConditions(l, conditions));
  const supabase = getSupabaseAdminClient();
  await supabase.from("sales_discovery_segment_memberships").delete().eq("segment_id", segmentId);
  if (matched.length) {
    await supabase.from("sales_discovery_segment_memberships").insert(
      matched
        .filter((l) => l.leadId)
        .map((l) => ({
          segment_id: segmentId,
          lead_id: l.leadId,
          reason: "dynamic_match",
        })),
    );
  }
  return updateDiscoverySegment(segmentId, {
    conditions,
    leadCount: matched.filter((l) => l.leadId).length,
  });
}

export function explainSegmentMatch(row: LeadDiscoveryRow, group: SegmentConditionGroup): string[] {
  const reasons: string[] = [];
  for (const node of group.rules) {
    if (isGroup(node)) continue;
    if (matchRule(row, node)) {
      reasons.push(`${node.field} ${node.op} ${String(node.value ?? "")}`.trim());
    }
  }
  return reasons;
}
