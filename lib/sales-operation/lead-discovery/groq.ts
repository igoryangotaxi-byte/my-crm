import type { CompanyLlmQualification } from "@/lib/sales-operation/lead-discovery/types";
import {
  CATEGORY_SYNONYMS,
  CITY_ALIASES,
  DISCOVERY_CATEGORIES,
  ISRAEL_CITIES,
  PROMPT_VERSION,
  QUALIFICATION_RULE_CATALOG,
  type QualificationRuleOverride,
} from "@/lib/sales-operation/lead-discovery/types";
import type { EnrichedCompanyResult } from "@/lib/sales-operation/lead-discovery/types";

export type LlmProviderHealth = { ok: boolean; message?: string };
export type LlmUsageStatus = {
  enabled: boolean;
  requestsUsedToday: number;
  dailyLimit: number;
  remaining: number;
  forceRulesOnly: boolean;
  model: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

export type CampaignSegmentInterpretation = {
  summary: string;
  suggestedName: string;
  cities: string[];
  categories: string[];
  keywords: string[];
  mapsQueries: string[];
  excludedKeywords: string[];
  rulesSummary: string;
  qualificationRules: QualificationRuleOverride[];
  minTaxiScore: number;
};

const SYSTEM_PROMPT = `Use only the supplied company information.
Do not invent employee counts, contacts, offices, branches, business activity, transport needs or operating hours.
Do not present assumptions as confirmed facts.
Separate confirmed facts from inferred signals.
Every confirmed signal must contain evidence.
Return Unknown when information is insufficient.
Do not invent email addresses.
Do not invent contact names.
Do not infer exact employee count if only a size range can be estimated.
Return valid JSON matching the supplied schema.
Keep explanations short and factual.`;

const SEGMENT_SYSTEM_PROMPT = `You turn a salesperson's free-text segment description into Google Places search filters AND Taxi Potential qualification rules for Israel B2B corporate taxi lead discovery.
Return only valid JSON.
Prefer cities from the allowed Israel city list when possible; you may include other real Israel cities if clearly requested.
Business types (categories): map the user's intent to the allowed category list when possible.
If nothing in the list fits (e.g. leasing, cleaning, security), invent short Places-friendly business type labels that match the user's words — do NOT substitute an unrelated catalog item.
NEVER default to Hotels (or any lodging type) unless the user clearly asked for hotels/hostels/apartments.
Example: "компании занимающиеся лизингом" → categories: ["Leasing companies"], keywords: ["leasing","лизинг"], mapsQueries: ["leasing companies in Tel Aviv, Israel","car leasing in Tel Aviv, Israel"].
Do not invent companies, contacts, or employee counts.
mapsQueries must reflect the user's business type + city, in English Places query style.
Keep lists short and actionable (max 8 cities, 6 categories, 8 keywords, 10 mapsQueries).
For qualificationRules: only use signalKey values from the provided catalog.
Boost signals that match the segment; disable category_* signals that do not match (e.g. disable category_hotel for leasing).
Always keep hygiene/disqualify signals enabled: permanently_closed, no_website, no_contact, microbusiness, individual_pro.
weights are integers from -50 to 50.
Also return rulesSummary (short) and minTaxiScore (40-80, default 60).`;

function groqKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null;
}

export function isGroqConfigured(): boolean {
  return Boolean(groqKey());
}

export function defaultGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeCities(raw: string[]): string[] {
  const mapped = raw
    .map((city) => {
      const trimmed = city.trim();
      if (!trimmed) return null;
      const alias = CITY_ALIASES.find((a) => a.match.test(trimmed));
      if (alias) return alias.city;
      const idx = ISRAEL_CITIES.findIndex((c) => c.toLowerCase() === trimmed.toLowerCase());
      if (idx >= 0) return ISRAEL_CITIES[idx];
      return trimmed;
    })
    .filter((c): c is string => Boolean(c));
  const unique = [...new Set(mapped)].slice(0, 8);
  return unique.length ? unique : ["Tel Aviv"];
}

function citiesFromDescription(description: string): string[] {
  const found: string[] = [];
  for (const alias of CITY_ALIASES) {
    if (alias.match.test(description) && !found.includes(alias.city)) found.push(alias.city);
  }
  for (const city of ISRAEL_CITIES) {
    if (description.toLowerCase().includes(city.toLowerCase()) && !found.includes(city)) {
      found.push(city);
    }
  }
  return found.slice(0, 8);
}

function resolveCategoryLabel(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const exact = DISCOVERY_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  for (const syn of CATEGORY_SYNONYMS) {
    if (syn.match.test(trimmed)) return syn.category;
  }
  // Close catalog match only when the full catalog label appears inside the raw string (or vice versa).
  const contained = DISCOVERY_CATEGORIES.find(
    (c) => lower.includes(c.toLowerCase()) || c.toLowerCase().includes(lower),
  );
  if (contained && lower.length >= 4) return contained;
  // Keep free-form Places-friendly label from Groq / user — never rewrite to Hotels.
  return trimmed.slice(0, 60);
}

function normalizeCategories(raw: string[]): string[] {
  const mapped: string[] = [];
  for (const cat of raw) {
    const resolved = resolveCategoryLabel(cat);
    if (!resolved) continue;
    if (!mapped.some((x) => x.toLowerCase() === resolved.toLowerCase())) mapped.push(resolved);
    if (mapped.length >= 6) break;
  }
  return mapped;
}

function categoriesFromDescription(description: string): string[] {
  const found: string[] = [];
  for (const syn of CATEGORY_SYNONYMS) {
    if (syn.match.test(description)) {
      if (!found.includes(syn.category)) found.push(syn.category);
    }
  }
  return found.slice(0, 6);
}

function keywordsFromDescription(description: string, categories: string[]): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (!t || t.length < 3) return;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    out.push(t.slice(0, 40));
  };
  for (const cat of categories) push(cat);
  if (/лизинг|leasing|ליסינג/i.test(description)) {
    push("leasing");
    push("car leasing");
    push("equipment leasing");
  }
  const stop = new Set([
    "компании",
    "компанию",
    "занимающиеся",
    "занимается",
    "которые",
    "для",
    "нужен",
    "нужны",
    "ищу",
    "найти",
    "companies",
    "company",
    "that",
    "with",
    "need",
    "looking",
    "find",
    "israel",
    "израил",
    "израиле",
  ]);
  for (const token of description.split(/[\s,.;:!?/\\|()\[\]\"'«»]+/)) {
    const t = token.trim();
    if (t.length < 4) continue;
    if (stop.has(t.toLowerCase())) continue;
    if (CITY_ALIASES.some((a) => a.match.test(t))) continue;
    if (ISRAEL_CITIES.some((c) => c.toLowerCase() === t.toLowerCase())) continue;
    // Skip tokens already covered by a synonym category match
    if (CATEGORY_SYNONYMS.some((s) => s.match.test(t))) continue;
    push(t);
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}

function buildMapsQueries(cities: string[], categories: string[], keywords: string[]): string[] {
  const queries: string[] = [];
  const citiesOr = cities.length ? cities : ["Tel Aviv"];
  for (const city of citiesOr) {
    for (const cat of categories.slice(0, 4)) {
      queries.push(`${cat} in ${city}, Israel`);
    }
    for (const kw of keywords.slice(0, 4)) {
      if (categories.some((c) => c.toLowerCase() === kw.toLowerCase())) continue;
      queries.push(`${kw} in ${city}, Israel`);
    }
  }
  return [...new Set(queries)].slice(0, 10);
}

function heuristicRulesFromCategories(categories: string[]): QualificationRuleOverride[] {
  const text = categories.join(" ").toLowerCase();
  const boost = new Set<string>();
  if (/hotel|hostel|apartment|lodging/.test(text)) {
    boost.add("category_hotel");
    boost.add("airport_transfer");
    boost.add("guests_visitors");
    boost.add("business_travel");
  }
  if (/hospital|medical|clinic/.test(text)) {
    boost.add("category_hospital");
    boost.add("category_medical");
    boost.add("works_24_7");
    boost.add("night_shifts");
    boost.add("shift_based");
  }
  if (/high-tech|software|tech|office|cowork/.test(text)) {
    boost.add("employee_transport");
    boost.add("shuttle");
    boost.add("business_travel");
    boost.add("size_50_plus");
  }
  if (/logistic|factory|call/.test(text)) {
    boost.add("logistics");
    boost.add("shift_based");
    boost.add("night_shifts");
    boost.add("employee_transport");
  }
  if (/law|accounting|university|college|retail|construction|property/.test(text)) {
    boost.add("business_travel");
    boost.add("size_50_plus");
  }
  if (/leas|fleet|finance|bank|insurance/.test(text)) {
    boost.add("business_travel");
    boost.add("employee_transport");
    boost.add("size_50_plus");
    boost.add("multi_location");
  }

  return QUALIFICATION_RULE_CATALOG.map((base) => {
    const isCategory = base.signalKey.startsWith("category_");
    const boosted = boost.has(base.signalKey);
    let enabled: boolean = base.enabled;
    let weight: number = base.weight;
    if (isCategory) {
      // Only enable lodging/hospital category signals when the segment matches them.
      enabled = boosted;
      if (boosted) weight = Math.max(weight, 30);
    } else if (boosted) {
      enabled = true;
      weight = Math.min(50, weight + 5);
    }
    return {
      signalKey: base.signalKey,
      name: base.name,
      enabled,
      weight,
      isDisqualify: base.isDisqualify,
    };
  });
}

function normalizeQualificationRules(
  raw: unknown,
  categories: string[],
): QualificationRuleOverride[] {
  const catalogByKey = new Map<string, (typeof QUALIFICATION_RULE_CATALOG)[number]>(
    QUALIFICATION_RULE_CATALOG.map((r) => [r.signalKey, r]),
  );
  const fallback = heuristicRulesFromCategories(categories);
  if (!Array.isArray(raw) || !raw.length) return fallback;

  const overrides = new Map<string, { enabled?: boolean; weight?: number }>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = String(o.signalKey ?? "").trim();
    if (!catalogByKey.has(key)) continue;
    overrides.set(key, {
      enabled: typeof o.enabled === "boolean" ? o.enabled : undefined,
      weight: typeof o.weight === "number" ? o.weight : undefined,
    });
  }
  if (!overrides.size) return fallback;

  return QUALIFICATION_RULE_CATALOG.map((base) => {
    const o = overrides.get(base.signalKey);
    let enabled: boolean = o?.enabled ?? base.enabled;
    let weight: number = o?.weight ?? base.weight;
    if (base.signalKey === "permanently_closed") {
      enabled = true;
      weight = 0;
    }
    if (["no_website", "no_contact", "individual_pro", "microbusiness"].includes(base.signalKey)) {
      enabled = true;
    }
    weight = Math.max(-50, Math.min(50, Math.round(Number(weight) || 0)));
    return {
      signalKey: base.signalKey,
      name: base.name,
      enabled,
      weight,
      isDisqualify: base.isDisqualify,
    };
  });
}

function validateSegmentInterpretation(
  raw: unknown,
  sourceDescription?: string,
): CampaignSegmentInterpretation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cities = normalizeCities(asStringList(o.cities, 8));
  let categories = normalizeCategories(asStringList(o.categories, 6));
  let keywords = asStringList(o.keywords, 8);

  // If Groq omitted / emptied categories, recover from description — never invent Hotels.
  if (!categories.length && sourceDescription) {
    categories = categoriesFromDescription(sourceDescription);
  }
  if (!keywords.length && sourceDescription) {
    keywords = keywordsFromDescription(sourceDescription, categories);
  }
  if (!categories.length && keywords.length) {
    categories = keywords.slice(0, 3);
  }

  let mapsQueries = asStringList(o.mapsQueries, 10);
  if (!mapsQueries.length) {
    mapsQueries = buildMapsQueries(cities, categories, keywords);
  }
  // Drop lodging queries when the segment is clearly non-lodging.
  const lodgingForced =
    /hotel|hostel|apartment|lodging|гостиниц|מלון/i.test(sourceDescription ?? "") ||
    categories.some((c) => /hotel|hostel|apartment/i.test(c));
  if (!lodgingForced) {
    mapsQueries = mapsQueries.filter((q) => !/\bhotels?\b|\bhostels?\b/i.test(q));
    categories = categories.filter((c) => !/^(Hotels|Hostels|Serviced apartments)$/i.test(c));
    if (!categories.length && keywords.length) categories = keywords.slice(0, 3);
    if (!mapsQueries.length) mapsQueries = buildMapsQueries(cities, categories, keywords);
  }

  const suggestedName =
    typeof o.suggestedName === "string" && o.suggestedName.trim()
      ? o.suggestedName.trim().slice(0, 80)
      : `${categories[0] ?? keywords[0] ?? "Segment"} — ${cities[0] ?? "Israel"}`;
  const summary =
    typeof o.summary === "string" && o.summary.trim()
      ? o.summary.trim().slice(0, 280)
      : `Search ${[...categories, ...keywords].slice(0, 4).join(", ")} in ${cities.join(", ")}.`;
  const qualificationRules = normalizeQualificationRules(
    o.qualificationRules,
    categories.length ? categories : keywords,
  );
  const enabledPositive = qualificationRules.filter((r) => r.enabled && r.weight > 0);
  const rulesSummary =
    typeof o.rulesSummary === "string" && o.rulesSummary.trim()
      ? o.rulesSummary.trim().slice(0, 280)
      : `Focus on: ${enabledPositive
          .slice(0, 6)
          .map((r) => r.name)
          .join(", ")}.`;
  const minTaxiScoreRaw = Number(o.minTaxiScore ?? 60);
  const minTaxiScore = Number.isFinite(minTaxiScoreRaw)
    ? Math.max(40, Math.min(80, Math.round(minTaxiScoreRaw)))
    : 60;
  return {
    summary,
    suggestedName,
    cities,
    categories,
    keywords,
    mapsQueries,
    excludedKeywords: asStringList(o.excludedKeywords, 8),
    rulesSummary,
    qualificationRules,
    minTaxiScore,
  };
}

async function groqChatJson(params: {
  system: string;
  user: string;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<{ content: string; model: string }> {
  const apiKey = groqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
  const model = params.model || defaultGroqModel();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: params.maxTokens ?? 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 25000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatGroqHttpError(res.status, text));
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return { content: data.choices?.[0]?.message?.content ?? "", model };
}

export function isGroqRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /\b429\b/i.test(msg) || /rate limit/i.test(msg) || /tokens per day|TPD/i.test(msg);
}

export function formatGroqHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 500);
  if (status === 429 || /rate limit/i.test(snippet) || /tokens per day|TPD/i.test(snippet)) {
    const wait = snippet.match(/try again in ([0-9]+m[0-9.]*s)/i)?.[1];
    return wait
      ? `Groq daily token limit reached. Try again in ~${wait}, or continue with Rules Engine only.`
      : "Groq daily token limit reached. Wait for the quota to reset, or continue with Rules Engine only.";
  }
  if (status === 401 || status === 403) {
    return "Groq authentication failed. Check GROQ_API_KEY.";
  }
  return `Groq request failed (${status}): ${snippet.slice(0, 180)}`;
}

export function friendlyGroqError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? "Groq failed");
  if (isGroqRateLimitError(error)) {
    return formatGroqHttpError(429, msg);
  }
  if (msg.length > 220) return `${msg.slice(0, 200)}…`;
  return msg;
}

/** Offline fallback when Groq is unavailable / rate-limited — create-time only. */
export function interpretCampaignSegmentHeuristic(
  description: string,
): CampaignSegmentInterpretation {
  const text = description.trim();
  if (text.length < 8) throw new Error("Segment description is too short.");

  const citiesFound = citiesFromDescription(text);
  const normalizedCities = citiesFound.length ? citiesFound : ["Tel Aviv"];
  const categories = categoriesFromDescription(text);
  const keywords = keywordsFromDescription(text, categories);
  const businessTypes = [...categories];
  if (!businessTypes.length) {
    for (const kw of keywords) businessTypes.push(kw);
  }
  if (!businessTypes.length) {
    businessTypes.push(text.slice(0, 48).replace(/\s+/g, " ").trim());
  }
  const mapsQueries = buildMapsQueries(normalizedCities, businessTypes, keywords);
  const qualificationRules = heuristicRulesFromCategories(businessTypes);
  const suggestedName = `${businessTypes[0]} — ${normalizedCities[0]}`;
  const enabledPositive = qualificationRules.filter((r) => r.enabled && r.weight > 0);

  return {
    summary: `Local parse: ${businessTypes.join(", ")} in ${normalizedCities.join(", ")}.`,
    suggestedName,
    cities: normalizedCities,
    categories: businessTypes,
    keywords,
    mapsQueries,
    excludedKeywords: [],
    rulesSummary: `Focus on: ${enabledPositive
      .slice(0, 6)
      .map((r) => r.name)
      .join(", ")}.`,
    qualificationRules,
    minTaxiScore: 60,
  };
}


function validateQualification(raw: unknown): CompanyLlmQualification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sizes = ["1-10", "11-49", "50-99", "100-249", "250-499", "500+", "Unknown"];
  const conf = ["Low", "Medium", "High"];
  if (!sizes.includes(String(o.employeeSizeEstimate))) return null;
  if (!conf.includes(String(o.employeeSizeConfidence))) return null;
  return {
    companyCategory: String(o.companyCategory ?? "Unknown"),
    employeeSizeEstimate: o.employeeSizeEstimate as CompanyLlmQualification["employeeSizeEstimate"],
    employeeSizeConfidence: o.employeeSizeConfidence as CompanyLlmQualification["employeeSizeConfidence"],
    taxiNeedProbability: Number(o.taxiNeedProbability ?? 0),
    confirmedSignals: Array.isArray(o.confirmedSignals)
      ? (o.confirmedSignals as CompanyLlmQualification["confirmedSignals"])
      : [],
    inferredSignals: Array.isArray(o.inferredSignals)
      ? (o.inferredSignals as CompanyLlmQualification["inferredSignals"])
      : [],
    recommendedUseCases: Array.isArray(o.recommendedUseCases)
      ? o.recommendedUseCases.map(String)
      : [],
    recommendedDepartment: (o.recommendedDepartment as CompanyLlmQualification["recommendedDepartment"]) || "Unknown",
    qualificationExplanation: String(o.qualificationExplanation ?? ""),
    emailPersonalisationLine:
      typeof o.emailPersonalisationLine === "string" ? o.emailPersonalisationLine : null,
    missingInformation: Array.isArray(o.missingInformation)
      ? o.missingInformation.map(String)
      : [],
    requiresManualReview: Boolean(o.requiresManualReview),
    scoreAdjustment:
      typeof o.scoreAdjustment === "number"
        ? Math.max(-10, Math.min(10, o.scoreAdjustment))
        : 0,
    scoreAdjustmentReason:
      typeof o.scoreAdjustmentReason === "string" ? o.scoreAdjustmentReason : undefined,
  };
}

/**
 * Campaign-create only: turn a free-text segment description into Places search filters
 * and per-campaign qualification rule weights. Not used after the campaign exists.
 */
export async function groqInterpretCampaignSegment(
  description: string,
  opts?: { model?: string; timeoutMs?: number },
): Promise<{
  interpretation: CampaignSegmentInterpretation;
  model: string;
  promptVersion: string;
}> {
  const text = description.trim();
  if (text.length < 8) throw new Error("Segment description is too short.");

  const { content, model } = await groqChatJson({
    system: SEGMENT_SYSTEM_PROMPT,
    user: JSON.stringify(
      {
        description: text.slice(0, 2000),
        allowedCities: ISRAEL_CITIES,
        allowedCategories: DISCOVERY_CATEGORIES,
        qualificationCatalog: QUALIFICATION_RULE_CATALOG.map((r) => ({
          signalKey: r.signalKey,
          name: r.name,
          defaultWeight: r.weight,
          isDisqualify: r.isDisqualify,
        })),
        instruction:
          "Return JSON: summary, suggestedName, cities[], categories[], keywords[], mapsQueries[], excludedKeywords[], rulesSummary, minTaxiScore, qualificationRules[{signalKey,enabled,weight}].",
      },
      null,
      2,
    ),
    model: opts?.model,
    timeoutMs: opts?.timeoutMs ?? 30000,
    maxTokens: 2500,
  });

  const parsed = validateSegmentInterpretation(extractJson(content), text);
  if (!parsed) throw new Error("Groq returned invalid segment JSON.");
  return { interpretation: parsed, model, promptVersion: PROMPT_VERSION };
}

export async function groqQualifyCompany(
  company: EnrichedCompanyResult,
  opts?: { model?: string; timeoutMs?: number },
): Promise<{ qualification: CompanyLlmQualification; model: string; promptVersion: string }> {
  const userPrompt = JSON.stringify(
    {
      name: company.name,
      address: company.address,
      city: company.city,
      phone: company.phone,
      website: company.website,
      category: company.category,
      categories: company.categories,
      rating: company.rating,
      reviewsCount: company.reviewsCount,
      businessStatus: company.businessStatus,
      publicEmails: company.publicEmails,
      careersPage: company.careersPage,
      aboutText: company.aboutText?.slice(0, 4000),
      careersText: company.careersText?.slice(0, 2000),
      contactText: company.contactText?.slice(0, 2000),
      detectedSignals: company.signals,
      instruction:
        "Return JSON with fields: companyCategory, employeeSizeEstimate, employeeSizeConfidence, taxiNeedProbability (0-1), confirmedSignals[{signal,evidence,sourceUrl}], inferredSignals[{signal,reasoning,confidence}], recommendedUseCases[], recommendedDepartment, qualificationExplanation, emailPersonalisationLine, missingInformation[], requiresManualReview, scoreAdjustment (-10..10), scoreAdjustmentReason.",
    },
    null,
    2,
  );

  const { content, model } = await groqChatJson({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    model: opts?.model,
    timeoutMs: opts?.timeoutMs ?? 25000,
    maxTokens: 1800,
  });
  const parsed = validateQualification(extractJson(content));
  if (!parsed) throw new Error("Groq returned invalid qualification JSON.");
  return { qualification: parsed, model, promptVersion: PROMPT_VERSION };
}

export async function groqHealthCheck(): Promise<LlmProviderHealth> {
  if (!isGroqConfigured()) return { ok: false, message: "GROQ_API_KEY missing" };
  try {
    const apiKey = groqKey()!;
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, message: `Groq HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Groq unreachable" };
  }
}
