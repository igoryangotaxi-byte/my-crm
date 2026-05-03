import { requestChatText, requestStructuredJson } from "@/lib/llm";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type {
  ReferenceFlatTariffComparison,
  TariffHealthIntent,
  TariffHealthMetric,
  TariffHealthResult,
  TariffHealthSummary,
  TariffKmBand,
  TariffSuggestion,
  TariffSuggestionMetrics,
  TieredClientTariff,
} from "@/types/crm";

const PAGE_SIZE = 1000;

/** One tuned variant per structural family (flat / 5+rest / 5+5+rest), up to three suggestions total. */
const TIERED_TARIFF_FAMILIES = 3;

/** Reference flat tariff for comparison only (not used to optimize targets). */
export const REFERENCE_FLAT_BASE = 58.9;
export const REFERENCE_FLAT_KM_RATE = 5.9;

type IntentLike = Partial<{
  metric: string;
  clientName: string | null;
  corpClientId: string | null;
  period: Partial<{
    fromIso: string;
    toIsoExclusive: string;
    label: string;
  }>;
  fromDate: string;
  toDate: string;
  targetDecouplingRatePct: number | string | null;
}>;

export type OrderTripRow = {
  km: number;
  clientPaid: number;
  driverCost: number;
  decouplingAbs: number;
};

type SupabaseLike = ReturnType<typeof getSupabaseAdminClient>;

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function metricFromText(value: string | undefined): TariffHealthMetric {
  const text = (value ?? "").trim().toLowerCase();
  if (text.includes("trip") || text.includes("поезд")) return "trips";
  if (text.includes("driver") || text.includes("водител")) return "driver_cost";
  if (text.includes("spend") || text.includes("оборот") || text.includes("выруч")) {
    return "client_spend";
  }
  if (text.includes("abs") || text.includes("absolute")) return "decoupling_abs";
  if (text.includes("health")) return "health_check";
  return "decoupling_rate";
}

function toIsoAtUtc(dateLike: string, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return null;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const iso = `${dateLike}${suffix}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function plusOneDayIso(dateLike: string) {
  const parsed = toIsoAtUtc(dateLike);
  if (!parsed) return null;
  const dt = new Date(parsed);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString();
}

function monthStartIsoUtc(year: number, month1to12: number) {
  const dt = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
  return dt.toISOString();
}

function monthEndExclusiveIsoUtc(year: number, month1to12: number) {
  const dt = new Date(Date.UTC(year, month1to12, 1, 0, 0, 0, 0));
  return dt.toISOString();
}

function parseTargetPct(raw: unknown) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clamp(raw, 0.1, 95);
  }
  if (typeof raw === "string") {
    const parsed = Number(raw.replace("%", "").trim());
    if (Number.isFinite(parsed)) return clamp(parsed, 0.1, 95);
  }
  return null;
}

function extractTargetPctFromQuery(query: string) {
  const match = query.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? clamp(parsed, 0.1, 95) : null;
}

function extractCorpClientId(query: string) {
  const hex32 = query.match(/\b[a-f0-9]{32}\b/i)?.[0];
  if (hex32) return hex32.toLowerCase();
  const uuid = query.match(
    /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i,
  )?.[0];
  return uuid ? uuid.toLowerCase() : null;
}

const monthMap: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  ма: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12,
};

function extractMonthYear(query: string, now = new Date()) {
  const lower = query.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : now.getUTCFullYear();
  let month: number | null = null;
  for (const [name, value] of Object.entries(monthMap)) {
    if (lower.includes(name)) {
      month = value;
      break;
    }
  }
  if (!month) return null;
  return { month, year };
}

function fallbackIntent(query: string): TariffHealthIntent {
  const monthYear = extractMonthYear(query);
  const now = new Date();
  const month = monthYear?.month ?? now.getUTCMonth() + 1;
  const year = monthYear?.year ?? now.getUTCFullYear();
  return {
    metric: metricFromText(query),
    corpClientId: extractCorpClientId(query),
    clientName: null,
    period: {
      fromIso: monthStartIsoUtc(year, month),
      toIsoExclusive: monthEndExclusiveIsoUtc(year, month),
      label: `${year}-${String(month).padStart(2, "0")}`,
    },
    targetDecouplingRatePct: extractTargetPctFromQuery(query),
  };
}

function normalizeIntent(raw: IntentLike, query: string): TariffHealthIntent {
  const fallback = fallbackIntent(query);
  const metric = metricFromText(raw.metric ?? fallback.metric);
  const corpClientId =
    typeof raw.corpClientId === "string" && raw.corpClientId.trim()
      ? raw.corpClientId.trim().toLowerCase()
      : fallback.corpClientId;
  const clientName =
    typeof raw.clientName === "string" && raw.clientName.trim()
      ? raw.clientName.trim()
      : fallback.clientName;

  const fromFromPeriod = raw.period?.fromIso ? toIsoAtUtc(raw.period.fromIso.slice(0, 10)) : null;
  const toFromPeriod = raw.period?.toIsoExclusive
    ? toIsoAtUtc(raw.period.toIsoExclusive.slice(0, 10))
    : null;
  const fromFromDate = raw.fromDate ? toIsoAtUtc(raw.fromDate) : null;
  const toFromDate = raw.toDate ? plusOneDayIso(raw.toDate) : null;
  const fromIso = fromFromPeriod ?? fromFromDate ?? fallback.period.fromIso;
  const toIsoExclusive = toFromDate ?? toFromPeriod ?? fallback.period.toIsoExclusive;
  const periodLabel =
    typeof raw.period?.label === "string" && raw.period.label.trim()
      ? raw.period.label.trim()
      : fallback.period.label;

  const targetDecouplingRatePct =
    parseTargetPct(raw.targetDecouplingRatePct) ??
    fallback.targetDecouplingRatePct ??
    extractTargetPctFromQuery(query);

  return {
    metric,
    corpClientId,
    clientName,
    period: {
      fromIso,
      toIsoExclusive,
      label: periodLabel,
    },
    targetDecouplingRatePct,
  };
}

export async function parseTariffHealthIntent(query: string): Promise<TariffHealthIntent> {
  const systemPrompt = [
    "You extract analytics intent from user text.",
    "Return JSON only with keys:",
    "metric (decoupling_rate|decoupling_abs|trips|client_spend|driver_cost|health_check),",
    "clientName (string|null), corpClientId (string|null),",
    "fromDate (YYYY-MM-DD|null), toDate (YYYY-MM-DD|null),",
    "targetDecouplingRatePct (number|null).",
    "If user asks month+year, return exact month boundaries in fromDate/toDate.",
  ].join(" ");

  const userPrompt = `Query: ${query}`;

  try {
    const llmRaw = (await requestStructuredJson({
      systemPrompt,
      userPrompt,
    })) as IntentLike;
    return normalizeIntent(llmRaw, query);
  } catch {
    return fallbackIntent(query);
  }
}

async function resolveClientIds(
  supabase: SupabaseLike,
  intent: TariffHealthIntent,
): Promise<{ corpClientIds: string[]; displayName: string | null }> {
  if (intent.corpClientId) {
    const { data } = await supabase
      .from("gp_corp_client_map")
      .select("corp_client_id,client_name")
      .eq("corp_client_id", intent.corpClientId)
      .limit(1)
      .maybeSingle();
    return {
      corpClientIds: [intent.corpClientId],
      displayName: data?.client_name ?? intent.clientName ?? null,
    };
  }

  if (intent.clientName) {
    const { data } = await supabase
      .from("gp_corp_client_map")
      .select("corp_client_id,client_name")
      .ilike("client_name", `%${intent.clientName}%`)
      .limit(10);
    const ids = (data ?? [])
      .map((row) => String(row.corp_client_id ?? "").trim().toLowerCase())
      .filter(Boolean);
    return {
      corpClientIds: [...new Set(ids)],
      displayName: data?.[0]?.client_name ?? intent.clientName,
    };
  }

  return { corpClientIds: [], displayName: null };
}

async function loadMetricsRows(
  supabase: SupabaseLike,
  corpClientIds: string[],
  fromIso: string,
  toIsoExclusive: string,
) {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select(
        "order_id,corp_client_id,lcl_order_due_dttm,user_w_vat_cost,driver_cost,decoupling_driver_cost,transporting_distance_fact_km,transporting_distance_plan_km",
      )
      .in("corp_client_id", corpClientIds)
      .gte("lcl_order_due_dttm", fromIso)
      .lt("lcl_order_due_dttm", toIsoExclusive)
      .order("lcl_order_due_dttm", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to query metrics: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

export function buildTripsFromRows(rows: Array<Record<string, unknown>>): OrderTripRow[] {
  const trips: OrderTripRow[] = [];
  const rawKm: number[] = [];

  for (const row of rows) {
    const fact = toFiniteNumber(row.transporting_distance_fact_km);
    const plan = toFiniteNumber(row.transporting_distance_plan_km);
    const km = fact > 0 ? fact : plan > 0 ? plan : 0;
    rawKm.push(km);
    trips.push({
      km,
      clientPaid: toFiniteNumber(row.user_w_vat_cost),
      driverCost: toFiniteNumber(row.driver_cost),
      decouplingAbs: toFiniteNumber(row.decoupling_driver_cost),
    });
  }

  const positive = rawKm.filter((k) => k > 0).sort((a, b) => a - b);
  const p99 = positive.length ? positive[Math.floor(0.99 * (positive.length - 1))] : null;
  const cap = p99 != null ? Math.max(p99, 0.01) : null;
  if (cap != null) {
    for (const trip of trips) {
      if (trip.km > cap) {
        trip.km = cap;
      }
    }
  }

  return trips;
}

function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function kmVariablePortion(km: number, bands: TariffKmBand[]): number {
  let remaining = Math.max(0, km);
  let cost = 0;
  for (const band of bands) {
    if (remaining <= 0) break;
    const width = band.km == null ? remaining : Math.min(remaining, band.km);
    cost += width * band.ratePerKm;
    remaining -= width;
  }
  return cost;
}

export function computeTripPriceTiered(km: number, tariff: TieredClientTariff): number {
  return tariff.basePrice + kmVariablePortion(km, tariff.bands);
}

function portfolioMetrics(trips: OrderTripRow[], tariff: TieredClientTariff): TariffSuggestionMetrics {
  let simulatedTotal = 0;
  let actualTotal = 0;
  let incrementalDecouplingAbsTotal = 0;
  let simulatedDecouplingAbsTotal = 0;

  for (const trip of trips) {
    const sim = computeTripPriceTiered(trip.km, tariff);
    simulatedTotal += sim;
    actualTotal += trip.clientPaid;
    const simDec = sim - trip.driverCost;
    incrementalDecouplingAbsTotal += simDec - trip.decouplingAbs;
    simulatedDecouplingAbsTotal += simDec;
  }

  const n = trips.length;
  const simulatedAvgPerTrip = n > 0 ? simulatedTotal / n : 0;
  const actualAvgPerTrip = n > 0 ? actualTotal / n : 0;
  const deltaVsActualTotal = simulatedTotal - actualTotal;
  const deltaVsActualAvgPerTrip = simulatedAvgPerTrip - actualAvgPerTrip;
  const deltaPctAvgVsActual =
    actualAvgPerTrip > 0 ? (simulatedAvgPerTrip / actualAvgPerTrip - 1) * 100 : null;
  const portfolioDecouplingRatePct =
    simulatedTotal > 0 ? (simulatedDecouplingAbsTotal / simulatedTotal) * 100 : null;

  return {
    simulatedTotal,
    simulatedAvgPerTrip,
    deltaVsActualTotal,
    deltaVsActualAvgPerTrip,
    deltaPctAvgVsActual,
    portfolioDecouplingRatePct,
    incrementalDecouplingAbsTotal,
  };
}

function buildReferenceFlatComparison(trips: OrderTripRow[]): ReferenceFlatTariffComparison | null {
  if (trips.length === 0) return null;
  const tariff: TieredClientTariff = {
    basePrice: REFERENCE_FLAT_BASE,
    bands: [{ km: null, ratePerKm: REFERENCE_FLAT_KM_RATE }],
  };
  const metrics = portfolioMetrics(trips, tariff);
  const actualTotal = trips.reduce((s, t) => s + t.clientPaid, 0);
  const actualAvg = actualTotal / trips.length;
  return {
    label: "Reference flat tariff (comparison only)",
    basePrice: REFERENCE_FLAT_BASE,
    kmRate: REFERENCE_FLAT_KM_RATE,
    simulatedTotal: metrics.simulatedTotal,
    simulatedAvgPerTrip: metrics.simulatedAvgPerTrip,
    deltaVsActualTotal: metrics.deltaVsActualTotal,
    deltaPctAvgVsActual:
      actualAvg > 0 ? (metrics.simulatedAvgPerTrip / actualAvg - 1) * 100 : null,
  };
}

export function buildSummaryFromTrips(trips: OrderTripRow[]): TariffHealthSummary {
  let clientSpend = 0;
  let driverCost = 0;
  let decouplingAbs = 0;
  let kmSum = 0;
  let ordersWithKm = 0;
  const positiveKm: number[] = [];

  for (const trip of trips) {
    clientSpend += trip.clientPaid;
    driverCost += trip.driverCost;
    decouplingAbs += trip.decouplingAbs;
    kmSum += trip.km;
    if (trip.km > 0) {
      ordersWithKm += 1;
      positiveKm.push(trip.km);
    }
  }

  const tripsCount = trips.length;
  positiveKm.sort((a, b) => a - b);

  return {
    trips: tripsCount,
    clientSpend,
    driverCost,
    decouplingAbs,
    decouplingRatePct: clientSpend > 0 ? (decouplingAbs / clientSpend) * 100 : null,
    avgClientSpendPerTrip: tripsCount > 0 ? clientSpend / tripsCount : null,
    avgDriverCostPerTrip: tripsCount > 0 ? driverCost / tripsCount : null,
    ordersWithKm,
    avgKmPerTrip: tripsCount > 0 ? kmSum / tripsCount : null,
    kmP50: quantile(positiveKm, 0.5),
    kmP75: quantile(positiveKm, 0.75),
    kmP90: quantile(positiveKm, 0.9),
  };
}

function solveBaseForRequiredTotal(
  trips: OrderTripRow[],
  bands: TariffKmBand[],
  requiredTotal: number,
): number | null {
  const n = trips.length;
  if (n === 0) return null;
  const part = trips.reduce((sum, trip) => sum + kmVariablePortion(trip.km, bands), 0);
  return (requiredTotal - part) / n;
}

function roundTariff(tariff: TieredClientTariff): TieredClientTariff {
  return {
    basePrice: Number(tariff.basePrice.toFixed(2)),
    bands: tariff.bands.map((b) => ({
      km: b.km == null ? null : Number(b.km.toFixed(4)),
      ratePerKm: Number(b.ratePerKm.toFixed(2)),
    })),
  };
}

function metricsLessAggressive(a: TariffSuggestionMetrics, b: TariffSuggestionMetrics): boolean {
  const pa = a.deltaPctAvgVsActual ?? 1e9;
  const pb = b.deltaPctAvgVsActual ?? 1e9;
  if (pa !== pb) return pa < pb;
  return a.deltaVsActualAvgPerTrip < b.deltaVsActualAvgPerTrip;
}

function makeTieredSuggestion(
  trips: OrderTripRow[],
  requiredTotal: number,
  target: number,
  name: string,
  assumption: string,
  bands: TariffKmBand[],
): TariffSuggestion | null {
  const base = solveBaseForRequiredTotal(trips, bands, requiredTotal);
  if (base == null || !Number.isFinite(base) || base < 0) return null;
  if (bands.some((b) => b.ratePerKm < 0 || b.ratePerKm > 80)) return null;
  const tariff = roundTariff({ basePrice: base, bands });
  const metrics = portfolioMetrics(trips, tariff);
  if (metrics.portfolioDecouplingRatePct == null) return null;
  return {
    name,
    assumption,
    targetDecouplingRatePct: target,
    tariff,
    metrics,
  };
}

function pickLeastAggressiveInFamily(
  trips: OrderTripRow[],
  requiredTotal: number,
  target: number,
  baseName: string,
  baseAssumption: string,
  variants: Array<{ detail: string; bands: TariffKmBand[] }>,
): TariffSuggestion | null {
  let best: TariffSuggestion | null = null;
  for (const v of variants) {
    const s = makeTieredSuggestion(
      trips,
      requiredTotal,
      target,
      `${baseName} (${v.detail})`,
      baseAssumption,
      v.bands,
    );
    if (!s) continue;
    if (!best || metricsLessAggressive(s.metrics, best.metrics)) best = s;
  }
  return best;
}

export function buildTieredTariffSuggestions(
  trips: OrderTripRow[],
  targetRatePct: number | null,
): { suggestions: TariffSuggestion[]; assumptions: string[] } {
  const assumptions: string[] = [];
  assumptions.push(
    "Driver tariff is treated as fixed per historical trip; simulated decoupling uses simulated client price minus historical driver_cost.",
  );
  assumptions.push(
    "Default flat tariff (58.9 + 5.9×km) is reference-only and is not used to derive the optimized tiered tariffs.",
  );

  const summary = buildSummaryFromTrips(trips);
  if (summary.trips <= 0 || summary.clientSpend <= 0 || summary.driverCost <= 0) {
    assumptions.push("Недостаточно данных в выбранном периоде для надежной тарифной рекомендации.");
    return { suggestions: [], assumptions };
  }

  const currentRate = summary.decouplingRatePct ?? 0;
  const inferredTarget =
    targetRatePct ?? clamp(Math.max(currentRate + 3, 20), 5, 95);
  if (targetRatePct === null) {
    assumptions.push(
      `Целевой decoupling rate не указан, использован авто-таргет ${inferredTarget.toFixed(2)}%.`,
    );
  }

  const target = clamp(inferredTarget, 0.1, 95);
  const requiredTotal = summary.driverCost / (1 - target / 100);
  const revenueDelta = requiredTotal - summary.clientSpend;

  if (revenueDelta <= 0) {
    assumptions.push("Текущий decoupling rate уже достигает целевого значения (или выше).");
    return { suggestions: [], assumptions };
  }

  const flatVariants = [4, 5, 5.9, 7, 9, 12].map((r) => ({
    detail: `${r}/km`,
    bands: [{ km: null, ratePerKm: r }] as TariffKmBand[],
  }));

  const twoBandVariants: Array<{ detail: string; bands: TariffKmBand[] }> = [];
  const r1Two = [3, 4, 5, 6];
  const r2Two = [6, 8, 10, 12, 14];
  for (const r1 of r1Two) {
    for (const r2 of r2Two) {
      twoBandVariants.push({
        detail: `first 5 km @ ${r1}, then @ ${r2}`,
        bands: [
          { km: 5, ratePerKm: r1 },
          { km: null, ratePerKm: r2 },
        ],
      });
    }
  }

  const triplePresets: Array<[number, number, number]> = [
    [4, 6, 10],
    [5, 6, 8],
    [6, 8, 12],
    [4, 7, 11],
    [9, 7, 5],
    [8, 6, 5],
  ];
  const tripleVariants = triplePresets.map(([a, b, c]) => ({
    detail: `${a}/${b}/${c} per km on 5+5+rest`,
    bands: [
      { km: 5, ratePerKm: a },
      { km: 5, ratePerKm: b },
      { km: null, ratePerKm: c },
    ],
  }));

  const bestFlat = pickLeastAggressiveInFamily(
    trips,
    requiredTotal,
    target,
    "Flat km rate",
    "Single km rate after base; base is solved to match portfolio revenue target.",
    flatVariants,
  );

  const bestTwoBands = pickLeastAggressiveInFamily(
    trips,
    requiredTotal,
    target,
    "Two km bands (5 km + remainder)",
    "First 5 km priced separately from the rest; base is solved to match portfolio revenue target.",
    twoBandVariants,
  );

  const bestThreeBands = pickLeastAggressiveInFamily(
    trips,
    requiredTotal,
    target,
    "Three km bands (5 + 5 + remainder)",
    "Progressive ladder 5 km + 5 km + remaining distance; base is solved to match portfolio revenue target.",
    tripleVariants,
  );

  const limited = [bestFlat, bestTwoBands, bestThreeBands].filter(
    (s): s is TariffSuggestion => s != null,
  );

  if (limited.length > 0) {
    assumptions.push(
      `До ${TIERED_TARIFF_FAMILIES} вариантов — по одному на структуру сетки (плоская / два бэнда / три бэнда); внутри каждой структуры выбран наименее агрессивный к клиенту набор ставок (минимальный средний рост цены vs факт) при целевом portfolio decoupling ≈ ${target.toFixed(2)}%.`,
    );
  }
  if (limited.length === 0) {
    assumptions.push("Не удалось подобрать неотрицательный base для доступных km-сеток.");
  }

  return { suggestions: limited, assumptions };
}

async function buildTariffAnalystMarkdown(
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    return await requestChatText({
      systemPrompt: [
        "You are a senior B2B taxi pricing and decoupling analyst.",
        "Write a detailed, non-templated Markdown report for executives.",
        "Rules:",
        "- Use ONLY numbers and facts present in the JSON payload. Do not invent fields or statistics.",
        "- Clearly separate: Executive summary, Data snapshot, Tariff options, Trade-offs, Risks, Next steps.",
        "- Explain how each suggested tiered tariff would change average client price vs historical actuals.",
        "- Explain incremental decoupling impact using the provided simulated metrics.",
        "- If km coverage is weak, call it out explicitly.",
        "- Do not claim you performed web research; base conclusions strictly on the payload.",
      ].join("\n"),
      userPrompt: JSON.stringify(payload),
    });
  } catch {
    return null;
  }
}

export async function runTariffHealthCheck(query: string): Promise<TariffHealthResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error("Query is empty.");
  }

  const emptySummary: TariffHealthSummary = {
    trips: 0,
    clientSpend: 0,
    driverCost: 0,
    decouplingAbs: 0,
    decouplingRatePct: null,
    avgClientSpendPerTrip: null,
    avgDriverCostPerTrip: null,
    ordersWithKm: 0,
    avgKmPerTrip: null,
    kmP50: null,
    kmP75: null,
    kmP90: null,
  };

  const parsedIntent = await parseTariffHealthIntent(cleanQuery);
  const supabase = getSupabaseAdminClient();
  const resolvedClient = await resolveClientIds(supabase, parsedIntent);
  if (resolvedClient.corpClientIds.length === 0) {
    return {
      ok: false,
      query: cleanQuery,
      parsedIntent,
      resolvedClient: {
        corpClientIds: [],
        clientName: resolvedClient.displayName,
      },
      summary: emptySummary,
      referenceFlatTariff: null,
      suggestions: [],
      assumptions: [],
      analystMarkdown: null,
      error: "Client was not resolved. Use exact corp_client_id or client name from mapping table.",
    };
  }

  const rows = await loadMetricsRows(
    supabase,
    resolvedClient.corpClientIds,
    parsedIntent.period.fromIso,
    parsedIntent.period.toIsoExclusive,
  );
  const trips = buildTripsFromRows(rows);
  const summary = buildSummaryFromTrips(trips);
  const referenceFlatTariff = buildReferenceFlatComparison(trips);
  const recommendation = buildTieredTariffSuggestions(
    trips,
    parsedIntent.targetDecouplingRatePct ?? null,
  );

  const analystPayload = {
    query: cleanQuery,
    parsedIntent,
    resolvedClient,
    summary,
    referenceFlatTariff,
    suggestions: recommendation.suggestions,
    assumptions: recommendation.assumptions,
  };

  const analystMarkdown = await buildTariffAnalystMarkdown(analystPayload);

  return {
    ok: true,
    query: cleanQuery,
    parsedIntent,
    resolvedClient: {
      corpClientIds: resolvedClient.corpClientIds,
      clientName: resolvedClient.displayName,
    },
    summary,
    referenceFlatTariff,
    suggestions: recommendation.suggestions,
    assumptions: recommendation.assumptions,
    analystMarkdown,
    warning:
      parsedIntent.targetDecouplingRatePct === null
        ? "Target decoupling rate was not explicit in query, auto-target was used."
        : undefined,
  };
}
