/** Lead Discovery shared types (Phase 2+). */

export type EmployeeSizeEstimate =
  | "1-10"
  | "11-49"
  | "50-99"
  | "100-249"
  | "250-499"
  | "500+"
  | "Unknown";

export type EmployeeSizeConfidence = "Low" | "Medium" | "High";

export type QualificationStatus =
  | "pending"
  | "high_potential"
  | "medium_potential"
  | "low_potential"
  | "disqualified"
  | "manual_review";

export type CompanySizeMode = "strict_50_plus" | "likely_50_plus" | "include_unknown";

export type DiscoveryCampaignStatus = "draft" | "active" | "paused" | "completed" | "error";

export type DiscoverySearchParams = {
  country: string;
  cities: string[];
  categories: string[];
  keywords?: string[];
  excludedKeywords?: string[];
  mapsQueries?: string[];
  minRating?: number | null;
  minReviews?: number | null;
  maxResults?: number;
};

export type RawCompanyResult = {
  placeId: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  categories?: string[];
  rating?: number | null;
  reviewsCount?: number | null;
  businessStatus?: string | null;
  sourceUrl?: string | null;
};

export type EnrichedCompanyResult = RawCompanyResult & {
  domain?: string | null;
  publicEmails?: Array<{ email: string; type: string; sourceUrl?: string }>;
  careersPage?: boolean;
  aboutText?: string | null;
  careersText?: string | null;
  contactText?: string | null;
  contentHash?: string | null;
  signals?: Record<string, boolean>;
};

export type SourceHealthStatus = {
  ok: boolean;
  message?: string;
  latencyMs?: number;
};

export interface LeadDiscoverySource {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  search(params: DiscoverySearchParams): Promise<RawCompanyResult[]>;
  enrich(company: RawCompanyResult): Promise<EnrichedCompanyResult>;
  healthCheck(): Promise<SourceHealthStatus>;
}

export type ConfirmedSignal = {
  signal: string;
  evidence: string;
  sourceUrl?: string;
};

export type InferredSignal = {
  signal: string;
  reasoning: string;
  confidence: EmployeeSizeConfidence;
};

export type CompanyLlmQualification = {
  companyCategory: string;
  employeeSizeEstimate: EmployeeSizeEstimate;
  employeeSizeConfidence: EmployeeSizeConfidence;
  taxiNeedProbability: number;
  confirmedSignals: ConfirmedSignal[];
  inferredSignals: InferredSignal[];
  recommendedUseCases: string[];
  recommendedDepartment:
    | "HR"
    | "Operations"
    | "Office Management"
    | "Procurement"
    | "Finance"
    | "Travel Management"
    | "Administration"
    | "Unknown";
  qualificationExplanation: string;
  emailPersonalisationLine: string | null;
  missingInformation: string[];
  requiresManualReview: boolean;
  scoreAdjustment?: number;
  scoreAdjustmentReason?: string;
};

export type ScoreBreakdownItem = {
  signalKey: string;
  name: string;
  weight: number;
  applied: boolean;
};

export type QualificationResult = {
  baseScore: number;
  llmAdjustment: number;
  finalScore: number;
  qualificationStatus: QualificationStatus;
  employeeSizeEstimate: EmployeeSizeEstimate;
  employeeSizeConfidence: EmployeeSizeConfidence;
  breakdown: ScoreBreakdownItem[];
  confirmedSignals: ConfirmedSignal[];
  inferredSignals: InferredSignal[];
  missingInformation: string[];
  recommendedUseCases: string[];
  recommendedDepartment: string;
  emailPersonalisationLine: string | null;
  qualificationExplanation: string;
  qualificationMode: "ai" | "rules" | "hybrid";
  requiresManualReview: boolean;
  stickerKeys: string[];
  llmModel?: string | null;
  disqualified: boolean;
  disqualifyReason?: string | null;
};

export type DiscoveryCampaign = {
  id: string;
  name: string;
  description: string | null;
  country: string;
  cities: string[];
  districts: string[];
  categories: string[];
  keywords: string[];
  excludedKeywords: string[];
  mapsQueries: string[];
  searchRadiusM: number | null;
  minRating: number | null;
  minReviews: number | null;
  websiteRequired: boolean;
  emailRequired: boolean;
  phoneRequired: boolean;
  minTaxiScore: number;
  companySizeMode: CompanySizeMode;
  dailyLeadTarget: number;
  maxLeadsPerRun: number;
  runSchedule: string | null;
  timezone: string;
  pipelineStage: string;
  defaultOwnerUserId: string | null;
  defaultOwnerName: string | null;
  assignmentRule: "fixed" | "round_robin" | "none";
  stickerKeys: string[];
  ruleSetId: string | null;
  segmentId: string | null;
  emailSequenceId: string | null;
  manualApproval: boolean;
  autoAddToPipeline: boolean;
  autoStartEmailSequence: boolean;
  status: DiscoveryCampaignStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadDiscoveryRow = {
  id: string;
  leadId: string | null;
  campaignId: string | null;
  runId: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  googlePlaceId: string | null;
  domain: string | null;
  website: string | null;
  city: string | null;
  district: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  googleCategory: string | null;
  businessCategories: string[];
  rating: number | null;
  reviewsCount: number | null;
  businessStatus: string | null;
  source: string;
  sourceUrl: string | null;
  employeeSizeEstimate: EmployeeSizeEstimate;
  employeeSizeConfidence: EmployeeSizeConfidence;
  taxiPotentialScore: number;
  qualificationStatus: QualificationStatus;
  scoreBreakdown: ScoreBreakdownItem[];
  confirmedSignals: ConfirmedSignal[];
  inferredSignals: InferredSignal[];
  missingInformation: string[];
  recommendedUseCases: string[];
  recommendedDepartment: string | null;
  emailPersonalisationLine: string | null;
  dataCompletenessScore: number;
  llmConfidence: string | null;
  llmModel: string | null;
  llmPromptVersion: string | null;
  qualificationMode: "ai" | "rules" | "hybrid";
  websiteContentHash: string | null;
  enrichment: Record<string, unknown>;
  pendingStickerKeys: string[];
  requiresManualReview: boolean;
  doNotContact: boolean;
  duplicateConfidence: number | null;
  discoveredAt: string;
  lastEnrichedAt: string | null;
  lastQualifiedAt: string | null;
  approvedAt: string | null;
};

export type DiscoverySegment = {
  id: string;
  name: string;
  description: string | null;
  colour: string | null;
  ownerUserId: string | null;
  segmentType: "static" | "dynamic";
  conditions: SegmentConditionGroup;
  leadCount: number;
  lastCalculatedAt: string | null;
  campaignId: string | null;
  emailSequenceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SegmentConditionRule = {
  field: string;
  op: "eq" | "neq" | "gte" | "lte" | "gt" | "lt" | "exists" | "not_exists" | "in" | "contains";
  value?: unknown;
};

export type SegmentConditionGroup = {
  op: "and" | "or";
  rules: Array<SegmentConditionRule | SegmentConditionGroup>;
};

export type EmailSequence = {
  id: string;
  name: string;
  description: string | null;
  sender: string | null;
  timezone: string;
  dailyLimit: number;
  manualApproval: boolean;
  autoStart: boolean;
  stopOnReply: boolean;
  stopOnBounce: boolean;
  stopOnUnsubscribe: boolean;
  stopOnDnc: boolean;
  mode: "fully_automatic" | "manual_approval" | "high_potential_only" | "verified_email_only";
  status: "draft" | "active" | "paused" | "archived";
  steps: EmailSequenceStep[];
  createdAt: string;
  updatedAt: string;
};

export type EmailSequenceStep = {
  id: string;
  sequenceId: string;
  stepIndex: number;
  delayDays: number;
  subject: string;
  body: string;
  templateId: string | null;
};

export const PROMPT_VERSION = "v1";

export const DEFAULT_RULE_SET_ID = "00000000-0000-4000-8000-000000000001";

/** Canonical qualification signals — Groq may only enable/weight keys from this list. */
export const QUALIFICATION_RULE_CATALOG = [
  { name: "Hotel", signalKey: "category_hotel", weight: 30, enabled: true, isDisqualify: false, sortOrder: 10 },
  { name: "Hospital", signalKey: "category_hospital", weight: 30, enabled: true, isDisqualify: false, sortOrder: 20 },
  { name: "Medical centre", signalKey: "category_medical", weight: 25, enabled: true, isDisqualify: false, sortOrder: 30 },
  { name: "Works 24/7", signalKey: "works_24_7", weight: 20, enabled: true, isDisqualify: false, sortOrder: 40 },
  { name: "Night shifts", signalKey: "night_shifts", weight: 20, enabled: true, isDisqualify: false, sortOrder: 50 },
  { name: "More than one location", signalKey: "multi_location", weight: 15, enabled: true, isDisqualify: false, sortOrder: 60 },
  { name: "More than three locations", signalKey: "multi_location_3plus", weight: 20, enabled: true, isDisqualify: false, sortOrder: 70 },
  { name: "More than one city", signalKey: "multi_city", weight: 15, enabled: true, isDisqualify: false, sortOrder: 80 },
  { name: "Estimated 50+ employees", signalKey: "size_50_plus", weight: 20, enabled: true, isDisqualify: false, sortOrder: 90 },
  { name: "Estimated 100+ employees", signalKey: "size_100_plus", weight: 25, enabled: true, isDisqualify: false, sortOrder: 100 },
  { name: "Estimated 250+ employees", signalKey: "size_250_plus", weight: 30, enabled: true, isDisqualify: false, sortOrder: 110 },
  { name: "Airport transfer mentioned", signalKey: "airport_transfer", weight: 15, enabled: true, isDisqualify: false, sortOrder: 120 },
  { name: "Employee transport mentioned", signalKey: "employee_transport", weight: 20, enabled: true, isDisqualify: false, sortOrder: 130 },
  { name: "Business travel mentioned", signalKey: "business_travel", weight: 15, enabled: true, isDisqualify: false, sortOrder: 140 },
  { name: "Shuttle mentioned", signalKey: "shuttle", weight: 15, enabled: true, isDisqualify: false, sortOrder: 150 },
  { name: "Careers page found", signalKey: "careers_page", weight: 10, enabled: true, isDisqualify: false, sortOrder: 160 },
  { name: "Active hiring", signalKey: "active_hiring", weight: 10, enabled: true, isDisqualify: false, sortOrder: 170 },
  { name: "More than ten open jobs", signalKey: "jobs_10_plus", weight: 10, enabled: true, isDisqualify: false, sortOrder: 180 },
  { name: "Public business email found", signalKey: "public_email", weight: 10, enabled: true, isDisqualify: false, sortOrder: 190 },
  { name: "Public phone found", signalKey: "public_phone", weight: 5, enabled: true, isDisqualify: false, sortOrder: 200 },
  { name: "International business", signalKey: "international", weight: 10, enabled: true, isDisqualify: false, sortOrder: 210 },
  { name: "Located in business district", signalKey: "business_district", weight: 5, enabled: true, isDisqualify: false, sortOrder: 220 },
  { name: "Logistics-heavy business", signalKey: "logistics", weight: 15, enabled: true, isDisqualify: false, sortOrder: 230 },
  { name: "Shift-based business", signalKey: "shift_based", weight: 20, enabled: true, isDisqualify: false, sortOrder: 240 },
  { name: "Guests or visitors mentioned", signalKey: "guests_visitors", weight: 10, enabled: true, isDisqualify: false, sortOrder: 250 },
  { name: "No website", signalKey: "no_website", weight: -10, enabled: true, isDisqualify: false, sortOrder: 260 },
  { name: "No email and no phone", signalKey: "no_contact", weight: -20, enabled: true, isDisqualify: false, sortOrder: 270 },
  { name: "Company permanently closed", signalKey: "permanently_closed", weight: 0, enabled: true, isDisqualify: true, sortOrder: 280 },
  { name: "Individual professional", signalKey: "individual_pro", weight: -30, enabled: true, isDisqualify: false, sortOrder: 290 },
  { name: "Microbusiness", signalKey: "microbusiness", weight: -30, enabled: true, isDisqualify: false, sortOrder: 300 },
] as const;

export type QualificationRuleOverride = {
  signalKey: string;
  enabled: boolean;
  weight: number;
  name: string;
  isDisqualify: boolean;
};

export const ISRAEL_CITIES = [
  "Tel Aviv",
  "Ramat Gan",
  "Herzliya",
  "Petah Tikva",
  "Haifa",
  "Jerusalem",
  "Rishon LeZion",
  "Netanya",
  "Beer Sheva",
  "Ashdod",
  "Modi'in",
  "Holon",
  "Bat Yam",
  "Kfar Saba",
  "Ra'anana",
  "Rehovot",
  "Airport City",
] as const;

export const DISCOVERY_CATEGORIES = [
  "Hotels",
  "Hostels",
  "Serviced apartments",
  "Hospitals",
  "Medical centres",
  "Clinics",
  "High-tech companies",
  "Software companies",
  "Law firms",
  "Accounting firms",
  "Logistics companies",
  "Factories",
  "Call centres",
  "Coworking spaces",
  "Travel agencies",
  "Event agencies",
  "Universities",
  "Colleges",
  "Restaurant groups",
  "Retail chains",
  "Construction companies",
  "Property management companies",
  "Business centres",
  "International companies",
  "Leasing companies",
  "Car leasing companies",
  "Equipment leasing companies",
  "Fleet management companies",
  "Finance companies",
  "Insurance companies",
  "Banks",
] as const;

/** Multi-language / synonym → catalog business type (used by Groq normalize + heuristic). */
export const CATEGORY_SYNONYMS: Array<{ match: RegExp; category: (typeof DISCOVERY_CATEGORIES)[number] }> = [
  { match: /hotel|hotels|гостиниц|מלון|מלונות/i, category: "Hotels" },
  { match: /hostel|hostels|хостел/i, category: "Hostels" },
  { match: /serviced apartment|апартамент/i, category: "Serviced apartments" },
  { match: /hospital|больниц|בית חולים/i, category: "Hospitals" },
  { match: /clinic|клиник|מרפא/i, category: "Clinics" },
  { match: /medical centre|медцентр|medical center/i, category: "Medical centres" },
  { match: /high[- ]?tech|hi[- ]?tech|хайтек|הייטק/i, category: "High-tech companies" },
  { match: /software|софт(?!вер)/i, category: "Software companies" },
  { match: /law firm|юридич|адвокат|עורך דין/i, category: "Law firms" },
  { match: /account(ing|ant)|бухгалтер|רואה חשבון/i, category: "Accounting firms" },
  { match: /logistic|логистик|לוגיסט/i, category: "Logistics companies" },
  { match: /factory|factories|завод|фабрик/i, category: "Factories" },
  { match: /call.?cent(er|re)|колл.?центр/i, category: "Call centres" },
  { match: /cowork|коворк/i, category: "Coworking spaces" },
  { match: /travel agenc|тураген/i, category: "Travel agencies" },
  { match: /event agenc|ивент/i, category: "Event agencies" },
  { match: /universit|университет|אוניברסיט/i, category: "Universities" },
  { match: /college|колледж/i, category: "Colleges" },
  { match: /restaurant|ресторан/i, category: "Restaurant groups" },
  { match: /retail|ритейл|сеть магазинов/i, category: "Retail chains" },
  { match: /construction|строител/i, category: "Construction companies" },
  { match: /property management|управляющ|ניהול נכסים/i, category: "Property management companies" },
  { match: /business cent(er|re)|бизнес.?центр/i, category: "Business centres" },
  {
    match: /leas(e|ing)|лизинг|ליסינג|car lease|vehicle lease|equipment lease|fleet lease/i,
    category: "Leasing companies",
  },
  { match: /fleet management|управление автопарком/i, category: "Fleet management companies" },
  { match: /financ(e|ial company|ial firm)|финансов(ая|ые|ый)/i, category: "Finance companies" },
  { match: /insurance|страхован|ביטוח/i, category: "Insurance companies" },
  { match: /\bbank\b|банк|בנק/i, category: "Banks" },
];

/** City name aliases (RU/HE/EN) → canonical Israel city. */
export const CITY_ALIASES: Array<{ match: RegExp; city: (typeof ISRAEL_CITIES)[number] }> = [
  { match: /tel[\s-]?aviv|тель[\s-]?авив|תל[\s-]?אביב|tlv/i, city: "Tel Aviv" },
  { match: /herzliya|герцли|הרצליה/i, city: "Herzliya" },
  { match: /haifa|хайф|חיפה/i, city: "Haifa" },
  { match: /jerusalem|иерусалим|ירושלים/i, city: "Jerusalem" },
  { match: /ramat[\s-]?gan|рамат[\s-]?ган|רמת גן/i, city: "Ramat Gan" },
  { match: /petah[\s-]?tikva|петах|פתח תקווה/i, city: "Petah Tikva" },
  { match: /netanya|нетани|נתניה/i, city: "Netanya" },
  { match: /beer[\s-]?sheva|беэр|באר שבע/i, city: "Beer Sheva" },
  { match: /rishon|ришон|ראשון/i, city: "Rishon LeZion" },
  { match: /ra.?anana|раанана|רעננה/i, city: "Ra'anana" },
  { match: /kfar[\s-]?saba|кфар|כפר סבא/i, city: "Kfar Saba" },
  { match: /ashdod|ашдод|אשדוד/i, city: "Ashdod" },
  { match: /rehovot|реховот|רחובות/i, city: "Rehovot" },
  { match: /holon|холон|חולון/i, city: "Holon" },
  { match: /bat[\s-]?yam|бат[\s-]?ям|בת ים/i, city: "Bat Yam" },
  { match: /modi.?in|модиин|מודיעין/i, city: "Modi'in" },
  { match: /airport[\s-]?city|аэропорт.?сити/i, city: "Airport City" },
];
