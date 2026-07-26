import type {
  CompanySizeMode,
  EmployeeSizeConfidence,
  EmployeeSizeEstimate,
  EnrichedCompanyResult,
  QualificationResult,
  QualificationStatus,
  ScoreBreakdownItem,
} from "@/lib/sales-operation/lead-discovery/types";

export type DiscoveryRule = {
  id?: string;
  name: string;
  signalKey: string;
  weight: number;
  enabled: boolean;
  isDisqualify: boolean;
};

export function qualificationFromScore(score: number): QualificationStatus {
  if (score >= 80) return "high_potential";
  if (score >= 60) return "medium_potential";
  if (score >= 40) return "low_potential";
  return "disqualified";
}

export function passesSizeFilter(
  estimate: EmployeeSizeEstimate,
  confidence: EmployeeSizeConfidence,
  mode: CompanySizeMode,
): { pass: boolean; likely50: boolean } {
  const ranked: EmployeeSizeEstimate[] = ["1-10", "11-49", "50-99", "100-249", "250-499", "500+"];
  const idx = ranked.indexOf(estimate);
  const definite50 = idx >= ranked.indexOf("50-99");
  const likely50 =
    definite50 ||
    (estimate === "Unknown" && confidence !== "High"
      ? false
      : estimate === "11-49" && confidence === "Low"
        ? false
        : definite50);

  if (mode === "strict_50_plus") return { pass: definite50, likely50: definite50 };
  if (mode === "include_unknown") {
    if (estimate === "Unknown") return { pass: true, likely50: false };
    return { pass: definite50 || (estimate === "11-49" ? false : definite50), likely50: definite50 };
  }
  // likely_50_plus — Unknown size stays eligible for manual review upstream
  if (definite50) return { pass: true, likely50: true };
  if (estimate === "Unknown") {
    return { pass: confidence !== "High", likely50: confidence === "Medium" || confidence === "High" };
  }
  return { pass: false, likely50: false };
}

function inferSizeFromSignals(
  company: EnrichedCompanyResult,
): { estimate: EmployeeSizeEstimate; confidence: EmployeeSizeConfidence } {
  const reviews = company.reviewsCount ?? 0;
  const signals = company.signals ?? {};
  if (signals.microbusiness) return { estimate: "1-10", confidence: "Medium" };
  if (signals.individual_pro) return { estimate: "1-10", confidence: "Medium" };
  if (signals.size_250_plus) return { estimate: "250-499", confidence: "Medium" };
  if (signals.size_100_plus) return { estimate: "100-249", confidence: "Medium" };
  if (signals.size_50_plus) return { estimate: "50-99", confidence: "Medium" };

  // Heuristic from reviews + careers — never invent exact counts.
  if (reviews >= 500 || (signals.careers_page && signals.active_hiring && reviews >= 80)) {
    return { estimate: "100-249", confidence: "Low" };
  }
  if (reviews >= 120 || signals.careers_page) {
    return { estimate: "50-99", confidence: "Low" };
  }
  if (reviews >= 30) return { estimate: "11-49", confidence: "Low" };
  if (reviews > 0) return { estimate: "1-10", confidence: "Low" };
  return { estimate: "Unknown", confidence: "Low" };
}

function categorySignals(company: EnrichedCompanyResult): Record<string, boolean> {
  const cat = `${company.category ?? ""} ${(company.categories ?? []).join(" ")} ${company.name}`.toLowerCase();
  return {
    category_hotel: /hotel|lodging|hostel/.test(cat),
    category_hospital: /hospital/.test(cat),
    category_medical: /clinic|medical|health|doctor/.test(cat),
    logistics: /logistics|warehouse|freight/.test(cat),
    shift_based: /factory|call.?center|hospital|hotel|logistics/.test(cat),
  };
}

export function detectSignals(company: EnrichedCompanyResult): Record<string, boolean> {
  const size = inferSizeFromSignals(company);
  const merged = {
    ...categorySignals(company),
    ...(company.signals ?? {}),
  };
  if (size.estimate === "50-99" || size.estimate === "100-249" || size.estimate === "250-499" || size.estimate === "500+") {
    merged.size_50_plus = true;
  }
  if (size.estimate === "100-249" || size.estimate === "250-499" || size.estimate === "500+") {
    merged.size_100_plus = true;
  }
  if (size.estimate === "250-499" || size.estimate === "500+") {
    merged.size_250_plus = true;
  }
  if (size.estimate === "1-10") merged.microbusiness = true;
  if (!company.website) merged.no_website = true;
  return merged;
}

export function calculateRulesScore(
  company: EnrichedCompanyResult,
  rules: DiscoveryRule[],
): {
  baseScore: number;
  breakdown: ScoreBreakdownItem[];
  disqualified: boolean;
  disqualifyReason: string | null;
  signals: Record<string, boolean>;
  size: { estimate: EmployeeSizeEstimate; confidence: EmployeeSizeConfidence };
} {
  const size = inferSizeFromSignals(company);
  const signals = detectSignals(company);
  const breakdown: ScoreBreakdownItem[] = [];
  let raw = 0;
  let disqualified = false;
  let disqualifyReason: string | null = null;

  for (const rule of rules.filter((r) => r.enabled)) {
    const applied = Boolean(signals[rule.signalKey]);
    breakdown.push({
      signalKey: rule.signalKey,
      name: rule.name,
      weight: rule.weight,
      applied,
    });
    if (!applied) continue;
    if (rule.isDisqualify) {
      disqualified = true;
      disqualifyReason = rule.name;
      continue;
    }
    raw += rule.weight;
  }

  const baseScore = Math.max(0, Math.min(100, raw));
  return { baseScore, breakdown, disqualified, disqualifyReason, signals, size };
}

export function finalizeQualification(params: {
  baseScore: number;
  llmAdjustment: number;
  breakdown: ScoreBreakdownItem[];
  size: { estimate: EmployeeSizeEstimate; confidence: EmployeeSizeConfidence };
  company: EnrichedCompanyResult;
  mode: "ai" | "rules" | "hybrid";
  llm?: Partial<QualificationResult> & { qualificationExplanation?: string };
  companySizeMode: CompanySizeMode;
  minTaxiScore: number;
}): QualificationResult {
  const adj = Math.max(-10, Math.min(10, params.llmAdjustment));
  const finalScore = Math.max(0, Math.min(100, params.baseScore + adj));
  let status = qualificationFromScore(finalScore);
  const sizeCheck = passesSizeFilter(
    params.llm?.employeeSizeEstimate ?? params.size.estimate,
    params.llm?.employeeSizeConfidence ?? params.size.confidence,
    params.companySizeMode,
  );

  const estimate = params.llm?.employeeSizeEstimate ?? params.size.estimate;
  const confidence = params.llm?.employeeSizeConfidence ?? params.size.confidence;

  const stickerKeys = new Set<string>(["cold_lead"]);
  if (status === "high_potential") stickerKeys.add("high_taxi_potential");
  if (status === "medium_potential") stickerKeys.add("medium_taxi_potential");
  if (status === "low_potential") stickerKeys.add("low_taxi_potential");
  if (estimate === "50-99" || estimate === "100-249" || estimate === "250-499" || estimate === "500+") {
    stickerKeys.add("employees_50_plus");
  }
  if (estimate === "100-249" || estimate === "250-499" || estimate === "500+") {
    stickerKeys.add("employees_100_plus");
  }
  if (estimate === "Unknown") stickerKeys.add("size_not_confirmed");
  if (params.company.publicEmails?.length) stickerKeys.add("public_email_found");
  else stickerKeys.add("no_email");
  if (params.company.phone) stickerKeys.add("phone_found");
  if (params.company.signals?.works_24_7) stickerKeys.add("business_24_7");
  if (params.company.signals?.night_shifts || params.company.signals?.shift_based) {
    stickerKeys.add("shift_workers");
  }
  if (params.company.signals?.active_hiring) stickerKeys.add("active_hiring");
  if (params.company.signals?.airport_transfer) stickerKeys.add("airport_potential");
  if (params.company.signals?.employee_transport) stickerKeys.add("employee_transport_signal");
  if (params.company.signals?.business_travel) stickerKeys.add("business_travel_signal");
  if (params.mode === "rules") stickerKeys.add("rules_only");
  if (params.mode === "ai" || params.mode === "hybrid") stickerKeys.add("ai_qualified");

  let requiresManualReview = Boolean(params.llm?.requiresManualReview);
  if (!sizeCheck.pass && params.companySizeMode === "include_unknown" && estimate === "Unknown") {
    requiresManualReview = true;
    status = "manual_review";
    stickerKeys.add("needs_manual_review");
  } else if (!sizeCheck.pass) {
    status = "disqualified";
  }

  if (finalScore < params.minTaxiScore && status !== "manual_review") {
    status = qualificationFromScore(finalScore);
    if (finalScore < 40) status = "disqualified";
  }

  return {
    baseScore: params.baseScore,
    llmAdjustment: adj,
    finalScore,
    qualificationStatus: status,
    employeeSizeEstimate: estimate,
    employeeSizeConfidence: confidence,
    breakdown: params.breakdown,
    confirmedSignals: params.llm?.confirmedSignals ?? [],
    inferredSignals: params.llm?.inferredSignals ?? [],
    missingInformation: params.llm?.missingInformation ?? [],
    recommendedUseCases: params.llm?.recommendedUseCases ?? [],
    recommendedDepartment: params.llm?.recommendedDepartment ?? "Unknown",
    emailPersonalisationLine: params.llm?.emailPersonalisationLine ?? null,
    qualificationExplanation:
      params.llm?.qualificationExplanation ??
      `Rules score ${params.baseScore}/100 (${status.replace(/_/g, " ")}).`,
    qualificationMode: params.mode,
    requiresManualReview,
    stickerKeys: [...stickerKeys],
    llmModel: params.llm?.llmModel ?? null,
    disqualified: status === "disqualified",
    disqualifyReason: null,
  };
}
