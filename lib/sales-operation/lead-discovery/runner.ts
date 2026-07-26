import { listSalesClients, listSalesLeads } from "@/lib/sales-operation/repository";
import { findDuplicateLeads, normalizeCompany, normalizeEmail, normalizePhone } from "@/lib/sales-operation/dedup";
import { createGooglePlacesSource } from "@/lib/sales-operation/lead-discovery/places-source";
import {
  calculateRulesScore,
  finalizeQualification,
  passesSizeFilter,
} from "@/lib/sales-operation/lead-discovery/rules-engine";
import { groqQualifyCompany, isGroqConfigured, isGroqRateLimitError, friendlyGroqError } from "@/lib/sales-operation/lead-discovery/groq";
import {
  bumpGroqUsage,
  findDiscoveryByDomain,
  findDiscoveryByPlaceId,
  getDiscoveryCampaign,
  getDiscoverySettings,
  incrementDailyStat,
  listDiscoveryRules,
  saveDiscoveryCandidate,
  updateDiscoveryCampaign,
  writeDiscoveryLog,
} from "@/lib/sales-operation/lead-discovery/repository";
import type { DiscoveryCampaign, EnrichedCompanyResult } from "@/lib/sales-operation/lead-discovery/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

export type RunCampaignResult = {
  runId: string;
  found: number;
  qualified: number;
  rejected: number;
  duplicates: number;
  sizeFail: number;
  insufficientData: number;
  addedToPipeline: number;
  errors: string[];
};

async function createRun(campaignId: string): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_runs")
    .insert({ campaign_id: campaignId, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create run.");
  return String((data as { id: string }).id);
}

async function finishRun(
  runId: string,
  stats: Omit<RunCampaignResult, "runId" | "errors"> & {
    errorMessage?: string;
    cancelled?: boolean;
  },
) {
  const supabase = getSupabaseAdminClient();
  const status = stats.cancelled ? "cancelled" : stats.errorMessage ? "failed" : "completed";
  await supabase
    .from("sales_discovery_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      found_count: stats.found,
      qualified_count: stats.qualified,
      rejected_count: stats.rejected,
      duplicate_count: stats.duplicates,
      size_fail_count: stats.sizeFail,
      insufficient_data_count: stats.insufficientData,
      added_to_pipeline_count: stats.addedToPipeline,
      error_message: stats.cancelled
        ? "Campaign stopped by user"
        : (stats.errorMessage ?? null),
    })
    .eq("id", runId)
    .in("status", ["queued", "running"]);
}

async function isRunStillActive(runId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_discovery_runs")
    .select("status")
    .eq("id", runId)
    .maybeSingle();
  if (error || !data) return false;
  return String((data as { status: string }).status) === "running";
}

function domainOf(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export async function checkDiscoveryDuplicate(company: EnrichedCompanyResult): Promise<{
  kind: "none" | "exact" | "possible" | "customer";
  confidence: number;
  existingLeadId?: string;
}> {
  if (company.placeId) {
    const byPlace = await findDiscoveryByPlaceId(company.placeId);
    // Pending (not approved) candidates are updated in-place — not duplicates.
    if (byPlace?.approvedAt) {
      return { kind: "exact", confidence: 1, existingLeadId: byPlace.leadId ?? undefined };
    }
  }
  const domain = domainOf(company.website);
  if (domain) {
    const byDomain = await findDiscoveryByDomain(domain);
    if (byDomain?.approvedAt) {
      return { kind: "exact", confidence: 0.95, existingLeadId: byDomain.leadId ?? undefined };
    }
  }

  const clients = await listSalesClients();
  const companyNorm = normalizeCompany(company.name);
  const emailNorm = normalizeEmail(company.publicEmails?.[0]?.email);
  const phoneNorm = normalizePhone(company.phone);
  for (const c of clients) {
    if (companyNorm && normalizeCompany(c.companyName) === companyNorm) {
      return { kind: "customer", confidence: 0.9 };
    }
    if (emailNorm && normalizeEmail(c.email) === emailNorm) {
      return { kind: "customer", confidence: 0.95 };
    }
    if (phoneNorm && normalizePhone(c.phone) === phoneNorm) {
      return { kind: "customer", confidence: 0.85 };
    }
  }

  const leads = await listSalesLeads();
  const matches = findDuplicateLeads(
    {
      email: company.publicEmails?.[0]?.email,
      phone: company.phone,
      companyName: company.name,
    },
    leads,
  );
  if (matches.length) {
    const strong = matches[0].matchedOn.includes("email") || matches[0].matchedOn.includes("phone");
    return {
      kind: strong ? "exact" : "possible",
      confidence: strong ? 0.9 : 0.55,
      existingLeadId: matches[0].leadId,
    };
  }
  return { kind: "none", confidence: 0 };
}

export async function runDiscoveryCampaign(
  campaignId: string,
  _actor: { userId: string | null; name: string },
): Promise<RunCampaignResult> {
  const campaign = await getDiscoveryCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  // Find leads is a one-shot for this campaign only — paused/draft/active all allowed.
  // Stop sets status to paused mid-run; cooperative cancel checks isCampaignRunnable.

  const source = createGooglePlacesSource();
  if (!source.enabled) {
    throw new Error("Google Places is not configured (GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY).");
  }

  const runId = await createRun(campaignId);
  const stats = {
    found: 0,
    qualified: 0,
    rejected: 0,
    duplicates: 0,
    sizeFail: 0,
    insufficientData: 0,
    addedToPipeline: 0,
  };
  const errors: string[] = [];

  await writeDiscoveryLog({
    event: "campaign_started",
    message: `Campaign ${campaign.name} started`,
    campaignId,
    runId,
  });

  try {
    const settings = await getDiscoverySettings();
    const rules = await listDiscoveryRules(campaign.ruleSetId);
    const raw = await source.search({
      country: campaign.country,
      cities: campaign.cities,
      categories: campaign.categories,
      keywords: campaign.keywords,
      excludedKeywords: campaign.excludedKeywords,
      mapsQueries: campaign.mapsQueries,
      minRating: campaign.minRating,
      minReviews: campaign.minReviews,
      maxResults: campaign.maxLeadsPerRun,
    });
    stats.found = raw.length;
    await incrementDailyStat("discovered", raw.length);
    await writeDiscoveryLog({
      event: "companies_found",
      message: `Found ${raw.length} companies`,
      campaignId,
      runId,
      source: "google_places",
    });

    const overviewTarget = settings.dailyQualifiedTarget;
    let qualifiedTodayBump = 0;
    let groqBlockedForRun = settings.forceRulesOnly || !settings.groqEnabled;

    let stopped = false;
    for (const item of raw) {
      if (!(await isRunStillActive(runId))) {
        stopped = true;
        break;
      }
      if (qualifiedTodayBump >= Math.max(campaign.dailyLeadTarget, overviewTarget)) {
        break;
      }
      try {
        const enriched = await source.enrich(item);
        if (campaign.websiteRequired && !enriched.website) {
          stats.insufficientData += 1;
          await incrementDailyStat("insufficient_data");
          continue;
        }
        if (campaign.emailRequired && !(enriched.publicEmails?.length)) {
          stats.insufficientData += 1;
          await incrementDailyStat("insufficient_data");
          continue;
        }
        if (campaign.phoneRequired && !enriched.phone) {
          stats.insufficientData += 1;
          await incrementDailyStat("insufficient_data");
          continue;
        }

        const dup = await checkDiscoveryDuplicate(enriched);
        if (dup.kind === "exact" || dup.kind === "customer") {
          stats.duplicates += 1;
          await incrementDailyStat("duplicates");
          await writeDiscoveryLog({
            event: "duplicate_detected",
            message: `${enriched.name}: ${dup.kind}`,
            campaignId,
            runId,
            leadId: dup.existingLeadId,
          });
          continue;
        }

        const rulesResult = calculateRulesScore(enriched, rules);
        if (rulesResult.disqualified) {
          stats.rejected += 1;
          await incrementDailyStat("rejected");
          continue;
        }

        let mode: "ai" | "rules" | "hybrid" = "rules";
        let llmAdjustment = 0;
        let llmPartial: Parameters<typeof finalizeQualification>[0]["llm"] = {
          confirmedSignals: Object.entries(rulesResult.signals)
            .filter(([, v]) => v)
            .map(([signal]) => ({
              signal,
              evidence: "Detected by rules engine / website signals",
            })),
        };

        const canUseGroq =
          !groqBlockedForRun &&
          settings.groqEnabled &&
          !settings.forceRulesOnly &&
          isGroqConfigured() &&
          settings.groqRequestsUsedToday < settings.groqDailyRequestLimit;

        if (canUseGroq) {
          try {
            const { qualification, model } = await groqQualifyCompany(enriched, {
              model: settings.groqModel,
            });
            await bumpGroqUsage(true);
            mode = "hybrid";
            llmAdjustment = qualification.scoreAdjustment ?? 0;
            llmPartial = {
              ...qualification,
              llmModel: model,
            };
            await writeDiscoveryLog({
              event: "groq_response_received",
              message: `Qualified ${enriched.name}`,
              campaignId,
              runId,
              provider: "groq",
              model,
            });
          } catch (err) {
            const msg = friendlyGroqError(err);
            await bumpGroqUsage(false, msg);
            mode = "rules";
            llmPartial = {
              ...llmPartial,
              requiresManualReview: true,
            };
            if (isGroqRateLimitError(err)) {
              groqBlockedForRun = true;
              await writeDiscoveryLog({
                level: "warn",
                event: "groq_limit_reached",
                message: `${msg} Continuing this run with Rules Engine only.`,
                campaignId,
                runId,
                provider: "groq",
              });
            } else {
              await writeDiscoveryLog({
                level: "warn",
                event: "groq_failed",
                message: msg,
                campaignId,
                runId,
                provider: "groq",
              });
            }
          }
        } else if (settings.groqEnabled && groqBlockedForRun) {
          // already logged once when blocked
        } else if (!canUseGroq && settings.groqEnabled) {
          await writeDiscoveryLog({
            level: "warn",
            event: "groq_limit_reached",
            message: "Using Rules Engine only",
            campaignId,
            runId,
            provider: "groq",
          });
          groqBlockedForRun = true;
        }

        const qualification = finalizeQualification({
          baseScore: rulesResult.baseScore,
          llmAdjustment,
          breakdown: rulesResult.breakdown,
          size: rulesResult.size,
          company: enriched,
          mode,
          llm: llmPartial,
          companySizeMode: campaign.companySizeMode,
          minTaxiScore: campaign.minTaxiScore,
        });

        if (mode === "rules") {
          qualification.stickerKeys = Array.from(
            new Set([...qualification.stickerKeys, "rules_only", "ai_qualification_pending"]),
          );
        }

        const sizeOk = passesSizeFilter(
          qualification.employeeSizeEstimate,
          qualification.employeeSizeConfidence,
          campaign.companySizeMode,
        );
        if (!sizeOk.pass) {
          if (campaign.companySizeMode === "strict_50_plus") {
            stats.sizeFail += 1;
            await incrementDailyStat("size_fail");
            continue;
          }
          // Soft fail: keep as manual review so campaigns still produce candidates.
          qualification.qualificationStatus = "manual_review";
          qualification.requiresManualReview = true;
          qualification.stickerKeys = Array.from(
            new Set([...qualification.stickerKeys, "size_not_confirmed"]),
          );
          stats.sizeFail += 1;
          await incrementDailyStat("size_fail");
        }

        const isQualified =
          !qualification.disqualified &&
          (qualification.qualificationStatus === "manual_review" ||
            qualification.finalScore >= campaign.minTaxiScore);

        if (!isQualified) {
          stats.rejected += 1;
          await incrementDailyStat("rejected");
          continue;
        }

        // Never auto-push into pipeline — candidates wait for Approve in Lead Discovery.
        const stickers = [...qualification.stickerKeys];
        if (dup.kind === "possible") stickers.push("duplicate_suspected");
        if (qualification.requiresManualReview || campaign.manualApproval) {
          stickers.push("needs_manual_review");
        }
        if (!stickers.includes("cold_lead")) stickers.push("cold_lead");

        const email = enriched.publicEmails?.[0]?.email ?? null;
        const candidate = await saveDiscoveryCandidate({
          campaign_id: campaign.id,
          run_id: runId,
          company_name: enriched.name,
          email,
          phone: enriched.phone,
          address: enriched.address,
          google_place_id: enriched.placeId,
          domain: domainOf(enriched.website),
          website: enriched.website,
          city: campaign.cities[0] ?? enriched.city,
          country: "Israel",
          latitude: enriched.latitude,
          longitude: enriched.longitude,
          google_category: enriched.category,
          business_categories: enriched.categories ?? [],
          rating: enriched.rating,
          reviews_count: enriched.reviewsCount,
          business_status: enriched.businessStatus,
          source: "google_places",
          source_url: enriched.sourceUrl,
          employee_size_estimate: qualification.employeeSizeEstimate,
          employee_size_confidence: qualification.employeeSizeConfidence,
          taxi_potential_score: qualification.finalScore,
          qualification_status: qualification.qualificationStatus,
          score_breakdown: qualification.breakdown,
          confirmed_signals: qualification.confirmedSignals,
          inferred_signals: qualification.inferredSignals,
          missing_information: qualification.missingInformation,
          recommended_use_cases: qualification.recommendedUseCases,
          recommended_department: qualification.recommendedDepartment,
          email_personalisation_line: qualification.emailPersonalisationLine,
          qualification_mode: qualification.qualificationMode,
          llm_model: qualification.llmModel,
          website_content_hash: enriched.contentHash,
          enrichment: {
            explanation: qualification.qualificationExplanation,
            baseScore: qualification.baseScore,
            llmAdjustment: qualification.llmAdjustment,
          },
          pending_sticker_keys: stickers,
          requires_manual_review: true,
          duplicate_confidence: dup.kind === "possible" ? dup.confidence : null,
          last_enriched_at: new Date().toISOString(),
          last_qualified_at: new Date().toISOString(),
          discovered_at: new Date().toISOString(),
        });

        // Count progress only after the candidate is actually stored for this campaign.
        stats.qualified += 1;
        qualifiedTodayBump += 1;
        await incrementDailyStat("qualified");

        await writeDiscoveryLog({
          event: "candidate_ready",
          message: `Ready for approval: ${enriched.name} (score ${qualification.finalScore})`,
          campaignId,
          runId,
          leadId: candidate.leadId,
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Lead processing failed";
        const msg = isGroqRateLimitError(err) ? friendlyGroqError(err) : raw;
        // Don't treat Groq rate limits as run-breaking errors — rules path already continues.
        if (!isGroqRateLimitError(err)) errors.push(msg);
        await writeDiscoveryLog({
          level: isGroqRateLimitError(err) ? "warn" : "error",
          event: isGroqRateLimitError(err) ? "groq_limit_reached" : "error",
          message: msg,
          campaignId,
          runId,
        });
      }
    }

    await finishRun(runId, { ...stats, cancelled: stopped });
    if (stopped) {
      await writeDiscoveryLog({
        event: "campaign_stopped",
        message: `Campaign ${campaign.name} stopped during run`,
        campaignId,
        runId,
      });
      await updateDiscoveryCampaign(campaignId, {
        lastRunAt: new Date().toISOString(),
        lastError: null,
        status: "paused",
      });
    } else {
      const latest = await getDiscoveryCampaign(campaignId);
      // Keep scheduled "active". Draft → paused after a real run so badge isn't "never started".
      // Paused / error stay paused (idle) unless already active.
      let nextStatus = latest?.status ?? campaign.status;
      if (nextStatus === "draft" || nextStatus === "error") nextStatus = "paused";
      if (latest?.status === "active") nextStatus = "active";
      await updateDiscoveryCampaign(campaignId, {
        lastRunAt: new Date().toISOString(),
        lastError: errors[0] ?? null,
        status: nextStatus,
      });
    }

    return { runId, ...stats, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Campaign run failed";
    await finishRun(runId, { ...stats, errorMessage: msg });
    const latest = await getDiscoveryCampaign(campaignId);
    if (latest?.status !== "paused") {
      await updateDiscoveryCampaign(campaignId, { lastError: msg, status: "error" });
    }
    throw err;
  }
}

/** Cron: at most one active campaign per tick so manual Find leads stays single-campaign. */
export async function tickDiscoveryJobs(actor = { userId: null as string | null, name: "cron" }) {
  const { listDiscoveryCampaigns } = await import(
    "@/lib/sales-operation/lead-discovery/repository"
  );
  const campaigns = (await listDiscoveryCampaigns()).filter((c) => c.status === "active");
  const results: Array<{ campaignId: string; ok: boolean; error?: string }> = [];
  const next = campaigns[0];
  if (!next) return results;
  try {
    await runDiscoveryCampaign(next.id, actor);
    results.push({ campaignId: next.id, ok: true });
  } catch (err) {
    results.push({
      campaignId: next.id,
      ok: false,
      error: err instanceof Error ? err.message : "failed",
    });
  }
  return results;
}

export function summarizeCampaignCoverage(campaign: DiscoveryCampaign) {
  return {
    cities: campaign.cities,
    categories: campaign.categories,
    minTaxiScore: campaign.minTaxiScore,
    companySizeMode: campaign.companySizeMode,
  };
}
