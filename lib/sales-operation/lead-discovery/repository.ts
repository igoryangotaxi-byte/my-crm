import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import type {
  DiscoveryCampaign,
  DiscoveryCampaignStatus,
  CompanySizeMode,
  LeadDiscoveryRow,
  DiscoverySegment,
  SegmentConditionGroup,
  EmailSequence,
  EmailSequenceStep,
  QualificationStatus,
  EmployeeSizeEstimate,
  EmployeeSizeConfidence,
} from "@/lib/sales-operation/lead-discovery/types";
import { QUALIFICATION_RULE_CATALOG, DEFAULT_RULE_SET_ID } from "@/lib/sales-operation/lead-discovery/types";
import type { DiscoveryRule } from "@/lib/sales-operation/lead-discovery/rules-engine";

export function isLeadDiscoveryEnabled(): boolean {
  const v = process.env.LEAD_DISCOVERY_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (v === "1" || v === "true" || v === "on") return true;
  // Default on in development when unset; production should set explicitly.
  return process.env.NODE_ENV !== "production";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

function mapCampaign(row: Record<string, unknown>): DiscoveryCampaign {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    country: String(row.country ?? "Israel"),
    cities: asStringArray(row.cities),
    districts: asStringArray(row.districts),
    categories: asStringArray(row.categories),
    keywords: asStringArray(row.keywords),
    excludedKeywords: asStringArray(row.excluded_keywords),
    mapsQueries: asStringArray(row.maps_queries),
    searchRadiusM: typeof row.search_radius_m === "number" ? row.search_radius_m : null,
    minRating: typeof row.min_rating === "number" ? Number(row.min_rating) : null,
    minReviews: typeof row.min_reviews === "number" ? row.min_reviews : null,
    websiteRequired: Boolean(row.website_required),
    emailRequired: Boolean(row.email_required),
    phoneRequired: Boolean(row.phone_required),
    minTaxiScore: Number(row.min_taxi_score ?? 60),
    companySizeMode: (row.company_size_mode as CompanySizeMode) || "include_unknown",
    dailyLeadTarget: Number(row.daily_lead_target ?? 10),
    maxLeadsPerRun: Number(row.max_leads_per_run ?? 50),
    runSchedule: typeof row.run_schedule === "string" ? row.run_schedule : null,
    timezone: String(row.timezone ?? "Asia/Jerusalem"),
    pipelineStage: String(row.pipeline_stage ?? "new"),
    defaultOwnerUserId:
      typeof row.default_owner_user_id === "string" ? row.default_owner_user_id : null,
    defaultOwnerName: typeof row.default_owner_name === "string" ? row.default_owner_name : null,
    assignmentRule: (row.assignment_rule as DiscoveryCampaign["assignmentRule"]) || "fixed",
    stickerKeys: asStringArray(row.sticker_keys),
    ruleSetId: typeof row.rule_set_id === "string" ? row.rule_set_id : null,
    segmentId: typeof row.segment_id === "string" ? row.segment_id : null,
    emailSequenceId: typeof row.email_sequence_id === "string" ? row.email_sequence_id : null,
    manualApproval: Boolean(row.manual_approval),
    autoAddToPipeline: row.auto_add_to_pipeline !== false,
    autoStartEmailSequence: Boolean(row.auto_start_email_sequence),
    status: (row.status as DiscoveryCampaignStatus) || "draft",
    lastRunAt: typeof row.last_run_at === "string" ? row.last_run_at : null,
    nextRunAt: typeof row.next_run_at === "string" ? row.next_run_at : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapLeadDiscovery(row: Record<string, unknown>): LeadDiscoveryRow {
  const enrichment =
    row.enrichment && typeof row.enrichment === "object"
      ? (row.enrichment as Record<string, unknown>)
      : {};
  return {
    id: String(row.id ?? row.lead_id ?? ""),
    leadId: typeof row.lead_id === "string" ? row.lead_id : null,
    campaignId: typeof row.campaign_id === "string" ? row.campaign_id : null,
    runId: typeof row.run_id === "string" ? row.run_id : null,
    companyName:
      typeof row.company_name === "string"
        ? row.company_name
        : typeof enrichment.companyName === "string"
          ? enrichment.companyName
          : null,
    email:
      typeof row.email === "string"
        ? row.email
        : typeof enrichment.email === "string"
          ? enrichment.email
          : null,
    phone:
      typeof row.phone === "string"
        ? row.phone
        : typeof enrichment.phone === "string"
          ? enrichment.phone
          : null,
    address:
      typeof row.address === "string"
        ? row.address
        : typeof enrichment.address === "string"
          ? enrichment.address
          : null,
    googlePlaceId: typeof row.google_place_id === "string" ? row.google_place_id : null,
    domain: typeof row.domain === "string" ? row.domain : null,
    website: typeof row.website === "string" ? row.website : null,
    city: typeof row.city === "string" ? row.city : null,
    district: typeof row.district === "string" ? row.district : null,
    country: String(row.country ?? "Israel"),
    latitude: typeof row.latitude === "number" ? Number(row.latitude) : null,
    longitude: typeof row.longitude === "number" ? Number(row.longitude) : null,
    googleCategory: typeof row.google_category === "string" ? row.google_category : null,
    businessCategories: asStringArray(row.business_categories),
    rating: typeof row.rating === "number" ? Number(row.rating) : null,
    reviewsCount: typeof row.reviews_count === "number" ? row.reviews_count : null,
    businessStatus: typeof row.business_status === "string" ? row.business_status : null,
    source: String(row.source ?? "google_places"),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    employeeSizeEstimate: (row.employee_size_estimate as EmployeeSizeEstimate) || "Unknown",
    employeeSizeConfidence: (row.employee_size_confidence as EmployeeSizeConfidence) || "Low",
    taxiPotentialScore: Number(row.taxi_potential_score ?? 0),
    qualificationStatus: (row.qualification_status as QualificationStatus) || "pending",
    scoreBreakdown: Array.isArray(row.score_breakdown)
      ? (row.score_breakdown as LeadDiscoveryRow["scoreBreakdown"])
      : [],
    confirmedSignals: Array.isArray(row.confirmed_signals)
      ? (row.confirmed_signals as LeadDiscoveryRow["confirmedSignals"])
      : [],
    inferredSignals: Array.isArray(row.inferred_signals)
      ? (row.inferred_signals as LeadDiscoveryRow["inferredSignals"])
      : [],
    missingInformation: asStringArray(row.missing_information),
    recommendedUseCases: asStringArray(row.recommended_use_cases),
    recommendedDepartment:
      typeof row.recommended_department === "string" ? row.recommended_department : null,
    emailPersonalisationLine:
      typeof row.email_personalisation_line === "string" ? row.email_personalisation_line : null,
    dataCompletenessScore: Number(row.data_completeness_score ?? 0),
    llmConfidence: typeof row.llm_confidence === "string" ? row.llm_confidence : null,
    llmModel: typeof row.llm_model === "string" ? row.llm_model : null,
    llmPromptVersion: typeof row.llm_prompt_version === "string" ? row.llm_prompt_version : null,
    qualificationMode: (row.qualification_mode as LeadDiscoveryRow["qualificationMode"]) || "rules",
    websiteContentHash: typeof row.website_content_hash === "string" ? row.website_content_hash : null,
    enrichment:
      row.enrichment && typeof row.enrichment === "object"
        ? (row.enrichment as Record<string, unknown>)
        : {},
    pendingStickerKeys: asStringArray(
      row.pending_sticker_keys ??
        (enrichment.pendingStickerKeys as unknown[] | undefined) ??
        [],
    ),
    requiresManualReview: Boolean(row.requires_manual_review),
    doNotContact: Boolean(row.do_not_contact),
    duplicateConfidence:
      typeof row.duplicate_confidence === "number" ? Number(row.duplicate_confidence) : null,
    discoveredAt: String(row.discovered_at),
    lastEnrichedAt: typeof row.last_enriched_at === "string" ? row.last_enriched_at : null,
    lastQualifiedAt: typeof row.last_qualified_at === "string" ? row.last_qualified_at : null,
    approvedAt:
      typeof row.approved_at === "string"
        ? row.approved_at
        : typeof enrichment.approvedAt === "string"
          ? enrichment.approvedAt
          : null,
  };
}

export async function writeDiscoveryLog(entry: {
  level?: "info" | "warn" | "error";
  event: string;
  message: string;
  campaignId?: string | null;
  leadId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  source?: string | null;
  provider?: string | null;
  model?: string | null;
  errorCode?: string | null;
  technicalDetails?: Record<string, unknown> | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("sales_discovery_logs").insert({
      level: entry.level ?? "info",
      event: entry.event,
      message: entry.message,
      campaign_id: entry.campaignId ?? null,
      lead_id: entry.leadId ?? null,
      run_id: entry.runId ?? null,
      job_id: entry.jobId ?? null,
      source: entry.source ?? null,
      provider: entry.provider ?? null,
      model: entry.model ?? null,
      error_code: entry.errorCode ?? null,
      technical_details: entry.technicalDetails ?? null,
    });
  } catch {
    // never block discovery on logging
  }
}

export async function getDiscoverySettings() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    dailyQualifiedTarget: Number(row.daily_qualified_target ?? 10),
    groqEnabled: row.groq_enabled !== false,
    groqModel: String(row.groq_model ?? "llama-3.3-70b-versatile"),
    groqDailyRequestLimit: Number(row.groq_daily_request_limit ?? 14400),
    groqRequestsUsedToday: Number(row.groq_requests_used_today ?? 0),
    groqUsageDay: typeof row.groq_usage_day === "string" ? row.groq_usage_day : null,
    groqLastSuccessAt: typeof row.groq_last_success_at === "string" ? row.groq_last_success_at : null,
    groqLastErrorAt: typeof row.groq_last_error_at === "string" ? row.groq_last_error_at : null,
    groqLastErrorMessage:
      typeof row.groq_last_error_message === "string" ? row.groq_last_error_message : null,
    forceRulesOnly: Boolean(row.force_rules_only),
  };
}

export async function updateDiscoverySettings(
  patch: Partial<{
    dailyQualifiedTarget: number;
    groqEnabled: boolean;
    groqModel: string;
    groqDailyRequestLimit: number;
    forceRulesOnly: boolean;
    resetGroqCounter: boolean;
  }>,
) {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.dailyQualifiedTarget != null) payload.daily_qualified_target = patch.dailyQualifiedTarget;
  if (patch.groqEnabled != null) payload.groq_enabled = patch.groqEnabled;
  if (patch.groqModel != null) payload.groq_model = patch.groqModel;
  if (patch.groqDailyRequestLimit != null) payload.groq_daily_request_limit = patch.groqDailyRequestLimit;
  if (patch.forceRulesOnly != null) payload.force_rules_only = patch.forceRulesOnly;
  if (patch.resetGroqCounter) {
    payload.groq_requests_used_today = 0;
    payload.groq_usage_day = new Date().toISOString().slice(0, 10);
  }
  const { error } = await supabase.from("sales_discovery_settings").upsert({ id: "default", ...payload });
  if (error) throw new Error(error.message);
  return getDiscoverySettings();
}

export async function bumpGroqUsage(success: boolean, errorMessage?: string) {
  const settings = await getDiscoverySettings();
  const today = new Date().toISOString().slice(0, 10);
  let used = settings.groqRequestsUsedToday;
  if (settings.groqUsageDay !== today) used = 0;
  used += 1;
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = {
    id: "default",
    groq_requests_used_today: used,
    groq_usage_day: today,
    updated_at: new Date().toISOString(),
  };
  if (success) payload.groq_last_success_at = new Date().toISOString();
  else {
    payload.groq_last_error_at = new Date().toISOString();
    payload.groq_last_error_message = errorMessage?.slice(0, 500) ?? "error";
  }
  await supabase.from("sales_discovery_settings").upsert(payload);
}

export async function listDiscoveryCampaigns(): Promise<DiscoveryCampaign[]> {
  await reconcileStaleDiscoveryRuns();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_campaigns")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCampaign(r as Record<string, unknown>));
}

/** Cancel runs stuck in "running" longer than maxAgeMs (default 20 min). */
export async function reconcileStaleDiscoveryRuns(maxAgeMs = 20 * 60 * 1000) {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const now = new Date().toISOString();
  await supabase
    .from("sales_discovery_runs")
    .update({
      status: "failed",
      finished_at: now,
      error_message: "Stale run timed out",
    })
    .eq("status", "running")
    .lt("started_at", cutoff);
  await supabase
    .from("sales_discovery_jobs")
    .update({
      status: "failed",
      updated_at: now,
      error_message: "Stale job timed out",
    })
    .eq("status", "running")
    .lt("updated_at", cutoff);
}

export async function listRunningCampaignIds(): Promise<string[]> {
  await reconcileStaleDiscoveryRuns();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_runs")
    .select("campaign_id")
    .eq("status", "running");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => String((r as { campaign_id: string }).campaign_id)))];
}

export async function deleteDiscoveryCampaign(id: string): Promise<void> {
  const campaign = await getDiscoveryCampaign(id);
  if (!campaign) throw new Error("Campaign not found.");
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from("sales_discovery_runs")
    .update({
      status: "cancelled",
      finished_at: now,
      error_message: "Campaign deleted",
    })
    .eq("campaign_id", id)
    .in("status", ["queued", "running"]);
  await supabase
    .from("sales_discovery_jobs")
    .update({
      status: "cancelled",
      updated_at: now,
      error_message: "Campaign deleted",
    })
    .eq("campaign_id", id)
    .in("status", ["queued", "running"]);

  const { error } = await supabase.from("sales_discovery_campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (campaign.ruleSetId && campaign.ruleSetId !== DEFAULT_RULE_SET_ID) {
    await supabase
      .from("sales_discovery_rule_sets")
      .delete()
      .eq("id", campaign.ruleSetId)
      .eq("is_default", false);
  }

  await writeDiscoveryLog({
    event: "campaign_deleted",
    message: `Campaign ${campaign.name} deleted`,
    campaignId: id,
  });
}

export async function getDiscoveryCampaign(id: string): Promise<DiscoveryCampaign | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCampaign(data as Record<string, unknown>) : null;
}

export type CampaignInput = Partial<DiscoveryCampaign> & { name: string };

export async function createDiscoveryCampaign(
  input: CampaignInput,
  actor: { userId: string | null; name: string },
): Promise<DiscoveryCampaign> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_discovery_campaigns")
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
      country: input.country ?? "Israel",
      cities: input.cities ?? ["Tel Aviv"],
      districts: input.districts ?? [],
      categories: input.categories ?? [],
      keywords: input.keywords ?? [],
      excluded_keywords: input.excludedKeywords ?? [],
      maps_queries: input.mapsQueries ?? [],
      min_rating: input.minRating ?? null,
      min_reviews: input.minReviews ?? null,
      website_required: input.websiteRequired ?? false,
      email_required: input.emailRequired ?? false,
      phone_required: input.phoneRequired ?? false,
      min_taxi_score: input.minTaxiScore ?? 60,
      company_size_mode: input.companySizeMode ?? "include_unknown",
      daily_lead_target: input.dailyLeadTarget ?? 10,
      max_leads_per_run: input.maxLeadsPerRun ?? 40,
      timezone: input.timezone ?? "Asia/Jerusalem",
      pipeline_stage: input.pipelineStage ?? "new",
      default_owner_user_id: input.defaultOwnerUserId ?? null,
      default_owner_name: input.defaultOwnerName ?? null,
      assignment_rule: input.assignmentRule ?? "fixed",
      sticker_keys: input.stickerKeys ?? ["cold_lead"],
      rule_set_id: input.ruleSetId ?? "00000000-0000-4000-8000-000000000001",
      manual_approval: input.manualApproval ?? true,
      auto_add_to_pipeline: input.autoAddToPipeline ?? false,
      auto_start_email_sequence: input.autoStartEmailSequence ?? false,
      status: input.status ?? "draft",
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create campaign.");
  return mapCampaign(data as Record<string, unknown>);
}

export async function updateDiscoveryCampaign(
  id: string,
  patch: Partial<DiscoveryCampaign>,
): Promise<DiscoveryCampaign> {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Array<[keyof DiscoveryCampaign, string]> = [
    ["name", "name"],
    ["description", "description"],
    ["country", "country"],
    ["cities", "cities"],
    ["districts", "districts"],
    ["categories", "categories"],
    ["keywords", "keywords"],
    ["excludedKeywords", "excluded_keywords"],
    ["mapsQueries", "maps_queries"],
    ["minRating", "min_rating"],
    ["minReviews", "min_reviews"],
    ["websiteRequired", "website_required"],
    ["emailRequired", "email_required"],
    ["phoneRequired", "phone_required"],
    ["minTaxiScore", "min_taxi_score"],
    ["companySizeMode", "company_size_mode"],
    ["dailyLeadTarget", "daily_lead_target"],
    ["maxLeadsPerRun", "max_leads_per_run"],
    ["runSchedule", "run_schedule"],
    ["timezone", "timezone"],
    ["pipelineStage", "pipeline_stage"],
    ["defaultOwnerUserId", "default_owner_user_id"],
    ["defaultOwnerName", "default_owner_name"],
    ["assignmentRule", "assignment_rule"],
    ["stickerKeys", "sticker_keys"],
    ["ruleSetId", "rule_set_id"],
    ["segmentId", "segment_id"],
    ["emailSequenceId", "email_sequence_id"],
    ["manualApproval", "manual_approval"],
    ["autoAddToPipeline", "auto_add_to_pipeline"],
    ["autoStartEmailSequence", "auto_start_email_sequence"],
    ["status", "status"],
    ["lastError", "last_error"],
    ["lastRunAt", "last_run_at"],
    ["nextRunAt", "next_run_at"],
  ];
  for (const [k, col] of map) {
    if (patch[k] !== undefined) payload[col] = patch[k];
  }
  const { data, error } = await supabase
    .from("sales_discovery_campaigns")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update campaign.");
  return mapCampaign(data as Record<string, unknown>);
}

export async function listDiscoveryRules(ruleSetId?: string | null): Promise<DiscoveryRule[]> {
  const supabase = getSupabaseAdminClient();
  let q = supabase.from("sales_discovery_rules").select("*").order("sort_order", { ascending: true });
  if (ruleSetId) q = q.eq("rule_set_id", ruleSetId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      name: String(r.name),
      signalKey: String(r.signal_key),
      weight: Number(r.weight ?? 0),
      enabled: r.enabled !== false,
      isDisqualify: Boolean(r.is_disqualify),
    };
  });
}

export async function updateDiscoveryRule(
  id: string,
  patch: Partial<Pick<DiscoveryRule, "name" | "weight" | "enabled" | "isDisqualify">>,
) {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) payload.name = patch.name;
  if (patch.weight != null) payload.weight = patch.weight;
  if (patch.enabled != null) payload.enabled = patch.enabled;
  if (patch.isDisqualify != null) payload.is_disqualify = patch.isDisqualify;
  const { error } = await supabase.from("sales_discovery_rules").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Create a per-campaign rule set from the catalog + Groq segment overrides (create-time only). */
export async function createCampaignRuleSet(params: {
  name: string;
  description?: string | null;
  overrides: Array<{ signalKey: string; enabled?: boolean; weight?: number }>;
}): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: setRow, error: setError } = await supabase
    .from("sales_discovery_rule_sets")
    .insert({
      name: params.name.slice(0, 120),
      description: params.description?.slice(0, 500) ?? null,
      is_default: false,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (setError || !setRow) throw new Error(setError?.message ?? "Failed to create rule set.");

  const ruleSetId = String((setRow as { id: string }).id);
  const overrideMap = new Map(params.overrides.map((o) => [o.signalKey, o] as const));

  const rows = QUALIFICATION_RULE_CATALOG.map((base) => {
    const o = overrideMap.get(base.signalKey);
    let enabled = o?.enabled ?? base.enabled;
    let weight = o?.weight ?? base.weight;
    if (base.signalKey === "permanently_closed") {
      enabled = true;
      weight = 0;
    }
    if (["no_website", "no_contact", "individual_pro", "microbusiness"].includes(base.signalKey)) {
      enabled = true;
      if (o?.weight == null) weight = base.weight;
    }
    if (typeof weight === "number") weight = Math.max(-50, Math.min(50, Math.round(weight)));
    return {
      rule_set_id: ruleSetId,
      name: base.name,
      signal_key: base.signalKey,
      weight,
      enabled,
      is_disqualify: base.isDisqualify,
      sort_order: base.sortOrder,
      created_at: now,
      updated_at: now,
    };
  });

  const { error: rulesError } = await supabase.from("sales_discovery_rules").insert(rows);
  if (rulesError) throw new Error(rulesError.message);
  return ruleSetId;
}

export async function assignLeadStickers(
  leadId: string,
  keys: string[],
  meta?: { reason?: string; assignedBy?: string; removable?: boolean },
) {
  if (!keys.length) return;
  const supabase = getSupabaseAdminClient();
  const rows = keys.map((key) => ({
    lead_id: leadId,
    sticker_key: key,
    assigned_by: meta?.assignedBy ?? "system",
    reason: meta?.reason ?? null,
    removable: meta?.removable ?? !["cold_lead", "do_not_contact"].includes(key),
  }));
  await supabase.from("sales_lead_stickers").upsert(rows, { onConflict: "lead_id,sticker_key" });
}

export async function listLeadStickers(leadId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_lead_stickers")
    .select("sticker_key, reason, assigned_by, created_at, removable")
    .eq("lead_id", leadId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLeadDiscovery(leadId: string): Promise<LeadDiscoveryRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_lead_discovery")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadDiscovery(data as Record<string, unknown>) : null;
}

export async function getDiscoveryById(id: string): Promise<LeadDiscoveryRow | null> {
  const supabase = getSupabaseAdminClient();
  const byId = await supabase.from("sales_lead_discovery").select("*").eq("id", id).maybeSingle();
  if (!byId.error && byId.data) return mapLeadDiscovery(byId.data as Record<string, unknown>);
  const byLead = await supabase
    .from("sales_lead_discovery")
    .select("*")
    .eq("lead_id", id)
    .maybeSingle();
  if (byLead.error) throw new Error(byLead.error.message);
  return byLead.data ? mapLeadDiscovery(byLead.data as Record<string, unknown>) : null;
}

export async function listDiscoveredLeads(
  limit = 100,
  opts?: { campaignId?: string },
): Promise<LeadDiscoveryRow[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_lead_discovery")
    .select("*")
    .order("discovered_at", { ascending: false })
    .limit(limit);
  if (opts?.campaignId) {
    query = query.eq("campaign_id", opts.campaignId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapLeadDiscovery(r as Record<string, unknown>));
}

export async function findDiscoveryByPlaceId(placeId: string): Promise<LeadDiscoveryRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_lead_discovery")
    .select("*")
    .eq("google_place_id", placeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadDiscovery(data as Record<string, unknown>) : null;
}

export async function findDiscoveryByDomain(domain: string): Promise<LeadDiscoveryRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_lead_discovery")
    .select("*")
    .eq("domain", domain)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadDiscovery(data as Record<string, unknown>) : null;
}

export async function upsertLeadDiscovery(
  leadId: string,
  fields: Record<string, unknown>,
): Promise<LeadDiscoveryRow> {
  const supabase = getSupabaseAdminClient();
  const payload = {
    lead_id: leadId,
    ...fields,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("sales_lead_discovery")
    .upsert(payload, { onConflict: "lead_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save discovery row.");
  return mapLeadDiscovery(data as Record<string, unknown>);
}

/** Save / update a discovery candidate without putting it on the active pipeline. */
export async function saveDiscoveryCandidate(
  fields: Record<string, unknown> & {
    google_place_id?: string | null;
    domain?: string | null;
    company_name?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    campaign_id?: string | null;
  },
): Promise<LeadDiscoveryRow> {
  const supabase = getSupabaseAdminClient();
  const placeId = typeof fields.google_place_id === "string" ? fields.google_place_id : null;
  const domain = typeof fields.domain === "string" ? fields.domain : null;

  let existing: LeadDiscoveryRow | null = null;
  if (placeId) existing = await findDiscoveryByPlaceId(placeId);
  if (!existing && domain) existing = await findDiscoveryByDomain(domain);

  if (existing?.approvedAt) {
    return existing;
  }

  const discoveryFields: Record<string, unknown> = {
    ...fields,
    approved_at: null,
    requires_manual_review: true,
    updated_at: new Date().toISOString(),
  };

  // Path A: modern schema — candidate row without pipeline lead_id
  if (existing?.id && !existing.leadId) {
    const { data, error } = await supabase
      .from("sales_lead_discovery")
      .update(discoveryFields)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return mapLeadDiscovery(data as Record<string, unknown>);
  }

  if (!existing?.leadId) {
    const insertPayload = {
      ...discoveryFields,
      id: existing?.id || crypto.randomUUID(),
      lead_id: null,
      discovered_at: fields.discovered_at ?? new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("sales_lead_discovery")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();
    if (!error && data) return mapLeadDiscovery(data as Record<string, unknown>);
    // Any insert failure → legacy path (missing id column, lead_id NOT NULL, etc.)
    if (!error) {
      // unexpected empty result
    }
  }

  // Path B: legacy schema (lead_id required) — archived shadow lead, hidden from pipeline
  return saveDiscoveryCandidateWithShadowLead(discoveryFields, existing);
}

async function saveDiscoveryCandidateWithShadowLead(
  fields: Record<string, unknown>,
  existing: LeadDiscoveryRow | null,
): Promise<LeadDiscoveryRow> {
  const { createSalesLead, setSalesLeadArchived, updateSalesLead } = await import(
    "@/lib/sales-operation/repository"
  );
  const actor = { userId: null as string | null, name: "Lead Discovery" };
  const companyName =
    (typeof fields.company_name === "string" && fields.company_name.trim()) ||
    (typeof fields.domain === "string" && fields.domain) ||
    "Discovered company";

  let leadId = existing?.leadId ?? null;
  if (!leadId) {
    const lead = await createSalesLead(
      {
        fullName: companyName,
        companyName,
        email: typeof fields.email === "string" ? fields.email : null,
        phone: typeof fields.phone === "string" ? fields.phone : null,
        website: typeof fields.website === "string" ? fields.website : null,
        clientAddress: typeof fields.address === "string" ? fields.address : null,
        source: "discovery",
        status: "new",
        campaignId: typeof fields.campaign_id === "string" ? fields.campaign_id : null,
        customFields: {
          discovery: true,
          discoveryPendingApproval: true,
          googlePlaceId: fields.google_place_id ?? null,
        },
      },
      actor,
    );
    await setSalesLeadArchived(lead.id, true, actor);
    leadId = lead.id;
  } else {
    await updateSalesLead(
      leadId,
      {
        companyName,
        email: typeof fields.email === "string" ? fields.email : null,
        phone: typeof fields.phone === "string" ? fields.phone : null,
        website: typeof fields.website === "string" ? fields.website : null,
        clientAddress: typeof fields.address === "string" ? fields.address : null,
        campaignId: typeof fields.campaign_id === "string" ? fields.campaign_id : null,
        customFields: {
          discovery: true,
          discoveryPendingApproval: true,
          googlePlaceId: fields.google_place_id ?? null,
        },
      },
      actor,
    );
    await setSalesLeadArchived(leadId, true, actor);
  }

  const { lead_id: _ignored, id: _id, company_name, email, phone, address, pending_sticker_keys, approved_at, ...rest } =
    fields as Record<string, unknown> & {
      lead_id?: unknown;
      id?: unknown;
      company_name?: unknown;
      email?: unknown;
      phone?: unknown;
      address?: unknown;
      pending_sticker_keys?: unknown;
      approved_at?: unknown;
    };

  const prevEnrichment =
    rest.enrichment && typeof rest.enrichment === "object"
      ? (rest.enrichment as Record<string, unknown>)
      : {};

  return upsertLeadDiscovery(leadId, {
    ...rest,
    enrichment: {
      ...prevEnrichment,
      companyName: company_name ?? prevEnrichment.companyName ?? null,
      email: email ?? prevEnrichment.email ?? null,
      phone: phone ?? prevEnrichment.phone ?? null,
      address: address ?? prevEnrichment.address ?? null,
      pendingStickerKeys: pending_sticker_keys ?? prevEnrichment.pendingStickerKeys ?? [],
      approvedAt: null,
    },
    requires_manual_review: true,
  });
}

export async function approveDiscoveryToPipeline(
  discoveryId: string,
  actor: { userId: string | null; name: string },
): Promise<{ discovery: LeadDiscoveryRow; leadId: string }> {
  const { createSalesLead, setSalesLeadArchived, updateSalesLead } = await import(
    "@/lib/sales-operation/repository"
  );

  const discovery = await getDiscoveryById(discoveryId);
  if (!discovery) throw new Error("Discovery candidate not found.");
  if (discovery.approvedAt && discovery.leadId) {
    return { discovery, leadId: discovery.leadId };
  }
  if (discovery.qualificationStatus === "disqualified" || discovery.doNotContact) {
    throw new Error("Cannot approve a disqualified or do-not-contact candidate.");
  }

  const campaign = discovery.campaignId ? await getDiscoveryCampaign(discovery.campaignId) : null;
  const companyName = discovery.companyName?.trim() || discovery.domain || "Discovered company";
  const now = new Date().toISOString();
  const supabase = getSupabaseAdminClient();

  let leadId = discovery.leadId;
  if (leadId) {
    await setSalesLeadArchived(leadId, false, actor);
    await updateSalesLead(
      leadId,
      {
        companyName,
        fullName: companyName,
        email: discovery.email,
        phone: discovery.phone,
        website: discovery.website,
        clientAddress: discovery.address,
        campaignId: discovery.campaignId,
        campaignName: campaign?.name ?? null,
        assignedManagerUserId: campaign?.defaultOwnerUserId ?? null,
        assignedManagerName: campaign?.defaultOwnerName ?? null,
        customFields: {
          discovery: true,
          discoveryPendingApproval: false,
          googlePlaceId: discovery.googlePlaceId,
          taxiPotentialScore: discovery.taxiPotentialScore,
          discoveryId: discovery.id,
        },
      },
      actor,
    );
  } else {
    const lead = await createSalesLead(
      {
        fullName: companyName,
        companyName,
        email: discovery.email,
        phone: discovery.phone,
        website: discovery.website,
        source: "discovery",
        status: "new",
        campaignId: discovery.campaignId,
        campaignName: campaign?.name ?? null,
        clientAddress: discovery.address,
        assignedManagerUserId: campaign?.defaultOwnerUserId ?? null,
        assignedManagerName: campaign?.defaultOwnerName ?? null,
        customFields: {
          discovery: true,
          googlePlaceId: discovery.googlePlaceId,
          taxiPotentialScore: discovery.taxiPotentialScore,
          discoveryId: discovery.id,
        },
      },
      actor,
    );
    leadId = lead.id;
  }

  const stickers = [
    ...(discovery.pendingStickerKeys.length ? discovery.pendingStickerKeys : ["cold_lead"]),
  ];
  if (!stickers.includes("cold_lead")) stickers.unshift("cold_lead");

  const { data, error } = await supabase
    .from("sales_lead_discovery")
    .update({
      lead_id: leadId,
      requires_manual_review: false,
      updated_at: now,
      enrichment: {
        ...discovery.enrichment,
        companyName: discovery.companyName,
        email: discovery.email,
        phone: discovery.phone,
        address: discovery.address,
        pendingStickerKeys: [],
        approvedAt: now,
      },
      // Best-effort columns from newer migrations (ignored if missing via separate try)
      approved_at: now,
      pending_sticker_keys: [],
    })
    .or(`id.eq.${discoveryId},lead_id.eq.${discoveryId}`)
    .select("*")
    .maybeSingle();

  let saved = data;
  if (error || !saved) {
    // Legacy DBs without approved_at / pending_sticker_keys
    const legacy = await supabase
      .from("sales_lead_discovery")
      .update({
        lead_id: leadId,
        requires_manual_review: false,
        updated_at: now,
        enrichment: {
          ...discovery.enrichment,
          companyName: discovery.companyName,
          email: discovery.email,
          phone: discovery.phone,
          address: discovery.address,
          pendingStickerKeys: [],
          approvedAt: now,
        },
      })
      .eq("lead_id", leadId)
      .select("*")
      .maybeSingle();
    if (legacy.error || !legacy.data) {
      throw new Error(error?.message ?? legacy.error?.message ?? "Failed to link discovery to pipeline.");
    }
    saved = legacy.data;
  }

  await assignLeadStickers(leadId, stickers, {
    reason: "Approved from Lead Discovery",
  });
  await incrementDailyStat("added_to_pipeline");
  await writeDiscoveryLog({
    event: "pipeline_lead_created",
    message: `Approved ${companyName} into pipeline (score ${discovery.taxiPotentialScore})`,
    campaignId: discovery.campaignId,
    leadId,
  });

  return {
    discovery: mapLeadDiscovery(saved as Record<string, unknown>),
    leadId,
  };
}

export async function incrementDailyStat(
  field:
    | "discovered"
    | "qualified"
    | "rejected"
    | "duplicates"
    | "size_fail"
    | "insufficient_data"
    | "added_to_pipeline"
    | "emails_sent"
    | "replies"
    | "meetings"
    | "won",
  by = 1,
) {
  const supabase = getSupabaseAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("sales_discovery_daily_stats")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  const current = (data ?? { day }) as Record<string, unknown>;
  const next = Number(current[field] ?? 0) + by;
  await supabase.from("sales_discovery_daily_stats").upsert({
    ...current,
    day,
    [field]: next,
    updated_at: new Date().toISOString(),
  });
}

export async function getOverviewStats() {
  const supabase = getSupabaseAdminClient();
  await reconcileStaleDiscoveryRuns();
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getDiscoverySettings();
  const { data: dayRow } = await supabase
    .from("sales_discovery_daily_stats")
    .select("*")
    .eq("day", today)
    .maybeSingle();
  const day = (dayRow ?? {}) as Record<string, unknown>;

  const { count: activeCampaigns } = await supabase
    .from("sales_discovery_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const pendingRes = await supabase
    .from("sales_lead_discovery")
    .select("id", { count: "exact", head: true })
    .eq("requires_manual_review", true)
    .neq("qualification_status", "disqualified");

  const totalRes = await supabase
    .from("sales_lead_discovery")
    .select("id", { count: "exact", head: true });

  const { data: activeCampaignRows } = await supabase
    .from("sales_discovery_campaigns")
    .select("id, name, last_run_at, last_error, company_size_mode")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(5);

  const runningCampaignIds = await listRunningCampaignIds();
  const qualified = Number(day.qualified ?? 0);
  const pendingApproval = pendingRes.count ?? 0;

  return {
    leadsDiscoveredToday: Number(day.discovered ?? 0),
    qualifiedToday: qualified,
    pendingApproval,
    totalCandidates: totalRes.count ?? 0,
    dailyTarget: settings.dailyQualifiedTarget,
    dailyTargetProgress: `${pendingApproval} pending · ${qualified} qualified today`,
    rejectedToday: Number(day.rejected ?? 0),
    duplicatesToday: Number(day.duplicates ?? 0),
    sizeFailToday: Number(day.size_fail ?? 0),
    insufficientDataToday: Number(day.insufficient_data ?? 0),
    addedToPipelineToday: Number(day.added_to_pipeline ?? 0),
    emailsSentToday: Number(day.emails_sent ?? 0),
    repliesToday: Number(day.replies ?? 0),
    meetingsToday: Number(day.meetings ?? 0),
    wonToday: Number(day.won ?? 0),
    activeCampaigns: activeCampaigns ?? 0,
    runningCampaignIds,
    activeCampaignList: (activeCampaignRows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        name: String(r.name),
        lastRunAt: typeof r.last_run_at === "string" ? r.last_run_at : null,
        lastError: typeof r.last_error === "string" ? r.last_error : null,
        companySizeMode: typeof r.company_size_mode === "string" ? r.company_size_mode : null,
      };
    }),
    activeEmailSequences: 0,
    groq: {
      used: settings.groqRequestsUsedToday,
      limit: settings.groqDailyRequestLimit,
      forceRulesOnly: settings.forceRulesOnly,
      enabled: settings.groqEnabled,
      model: settings.groqModel,
    },
    targetReached: qualified >= settings.dailyQualifiedTarget,
  };
}

function mapSegment(row: Record<string, unknown>): DiscoverySegment {
  return {
    id: String(row.id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    colour: typeof row.colour === "string" ? row.colour : null,
    ownerUserId: typeof row.owner_user_id === "string" ? row.owner_user_id : null,
    segmentType: (row.segment_type as "static" | "dynamic") || "dynamic",
    conditions: (row.conditions as SegmentConditionGroup) || { op: "and", rules: [] },
    leadCount: Number(row.lead_count ?? 0),
    lastCalculatedAt: typeof row.last_calculated_at === "string" ? row.last_calculated_at : null,
    campaignId: typeof row.campaign_id === "string" ? row.campaign_id : null,
    emailSequenceId: typeof row.email_sequence_id === "string" ? row.email_sequence_id : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listDiscoverySegments(): Promise<DiscoverySegment[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_segments")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSegment(r as Record<string, unknown>));
}

export async function createDiscoverySegment(input: {
  name: string;
  description?: string | null;
  colour?: string | null;
  segmentType?: "static" | "dynamic";
  conditions?: SegmentConditionGroup;
}): Promise<DiscoverySegment> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_segments")
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
      colour: input.colour ?? null,
      segment_type: input.segmentType ?? "dynamic",
      conditions: input.conditions ?? { op: "and", rules: [] },
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create segment.");
  return mapSegment(data as Record<string, unknown>);
}

export async function updateDiscoverySegment(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    colour: string | null;
    conditions: SegmentConditionGroup;
    leadCount: number;
  }>,
): Promise<DiscoverySegment> {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.colour !== undefined) payload.colour = patch.colour;
  if (patch.conditions) payload.conditions = patch.conditions;
  if (patch.leadCount != null) {
    payload.lead_count = patch.leadCount;
    payload.last_calculated_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("sales_discovery_segments")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update segment.");
  return mapSegment(data as Record<string, unknown>);
}

function mapSequence(row: Record<string, unknown>, steps: EmailSequenceStep[] = []): EmailSequence {
  return {
    id: String(row.id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    sender: typeof row.sender === "string" ? row.sender : null,
    timezone: String(row.timezone ?? "Asia/Jerusalem"),
    dailyLimit: Number(row.daily_limit ?? 40),
    manualApproval: row.manual_approval !== false,
    autoStart: Boolean(row.auto_start),
    stopOnReply: row.stop_on_reply !== false,
    stopOnBounce: row.stop_on_bounce !== false,
    stopOnUnsubscribe: row.stop_on_unsubscribe !== false,
    stopOnDnc: row.stop_on_dnc !== false,
    mode: (row.mode as EmailSequence["mode"]) || "manual_approval",
    status: (row.status as EmailSequence["status"]) || "draft",
    steps,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listEmailSequences(): Promise<EmailSequence[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_email_sequences")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const sequences = data ?? [];
  const result: EmailSequence[] = [];
  for (const row of sequences) {
    const id = String((row as Record<string, unknown>).id);
    const { data: steps } = await supabase
      .from("sales_email_sequence_steps")
      .select("*")
      .eq("sequence_id", id)
      .order("step_index", { ascending: true });
    result.push(
      mapSequence(
        row as Record<string, unknown>,
        (steps ?? []).map((s) => {
          const r = s as Record<string, unknown>;
          return {
            id: String(r.id),
            sequenceId: String(r.sequence_id),
            stepIndex: Number(r.step_index ?? 0),
            delayDays: Number(r.delay_days ?? 0),
            subject: String(r.subject ?? ""),
            body: String(r.body ?? ""),
            templateId: typeof r.template_id === "string" ? r.template_id : null,
          };
        }),
      ),
    );
  }
  return result;
}

export async function createEmailSequence(input: {
  name: string;
  description?: string | null;
  manualApproval?: boolean;
  steps?: Array<{ delayDays: number; subject: string; body: string }>;
}): Promise<EmailSequence> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_email_sequences")
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
      manual_approval: input.manualApproval ?? true,
      mode: "manual_approval",
      status: "draft",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create sequence.");
  const id = String((data as Record<string, unknown>).id);
  const steps = input.steps?.length
    ? input.steps
    : [
        {
          delayDays: 0,
          subject: "Corporate taxi for {{company_name}}",
          body: "Hi,\n\n{{email_personalisation_line}}\n\nWe help companies like {{company_name}} in {{city}} with corporate taxi rides.\n\nBest regards,\n{{sales_manager_name}}",
        },
        {
          delayDays: 3,
          subject: "Following up — {{company_name}}",
          body: "Quick follow-up regarding corporate transportation for {{company_name}}.",
        },
        {
          delayDays: 7,
          subject: "Last note — {{company_name}}",
          body: "Sharing one last note about B2B taxi for your team.",
        },
      ];
  for (let i = 0; i < steps.length; i++) {
    await supabase.from("sales_email_sequence_steps").insert({
      sequence_id: id,
      step_index: i,
      delay_days: steps[i].delayDays,
      subject: steps[i].subject,
      body: steps[i].body,
    });
  }
  const list = await listEmailSequences();
  return list.find((s) => s.id === id)!;
}

export async function listDiscoveryLogs(limit = 100) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_logs")
    .select("id, level, event, message, campaign_id, lead_id, created_at, error_code, provider")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
