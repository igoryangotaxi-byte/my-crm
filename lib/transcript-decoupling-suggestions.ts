import { describeTranscriptMotRules } from "@/lib/transcript-mot-tariff-description";
import { buildDeterministicDecouplingSuggestions } from "@/lib/transcript-decoupling-fallback";
import { requestStructuredJson } from "@/lib/llm";
import {
  findMatchingSegmentIndex,
  parseTranscriptMotRules,
  type TranscriptMotRules,
} from "@/lib/transcript-mot-tariff-rules";
import {
  simulatePortfolioDecouplingPct,
  type DecouplingSuggestionResult,
  type TripForDecouplingSimulation,
} from "@/lib/transcript-decoupling-shared";

export type { DecouplingSuggestionResult, TripForDecouplingSimulation } from "@/lib/transcript-decoupling-shared";

const SAMPLE_TRIPS_IN_PROMPT = 24;

function summarizeTripsForPrompt(currentRules: TranscriptMotRules, trips: TripForDecouplingSimulation[]) {
  const segmentCounts: number[] = currentRules.segments.map(() => 0);
  let sumKm = 0;
  let minKm = Infinity;
  let maxKm = -Infinity;
  for (const t of trips) {
    sumKm += t.km;
    minKm = Math.min(minKm, t.km);
    maxKm = Math.max(maxKm, t.km);
    const idx = findMatchingSegmentIndex(currentRules, new Date(t.tripIso));
    if (idx >= 0 && idx < segmentCounts.length) segmentCounts[idx] += 1;
  }
  const avgKm = trips.length > 0 ? sumKm / trips.length : 0;
  const sample = trips.slice(0, SAMPLE_TRIPS_IN_PROMPT).map((t) => ({
    km: Math.round(t.km * 1000) / 1000,
    tripIso: t.tripIso,
    driverPrice: Math.round(t.driverPrice * 100) / 100,
  }));
  return {
    segmentCounts,
    sumKm: Math.round(sumKm * 100) / 100,
    avgKm: Math.round(avgKm * 1000) / 1000,
    minKm: Number.isFinite(minKm) ? Math.round(minKm * 1000) / 1000 : 0,
    maxKm: Number.isFinite(maxKm) ? Math.round(maxKm * 1000) / 1000 : 0,
    sampleTripsJson: JSON.stringify(sample),
  };
}

export { simulatePortfolioDecouplingPct } from "@/lib/transcript-decoupling-shared";

async function runOpenAiDecouplingTariffSuggestions(params: {
  tariffCode: string;
  currentRules: TranscriptMotRules;
  trips: TripForDecouplingSimulation[];
  targetDecouplingPct: number;
  currentPct: number;
  timeoutMs: number;
}): Promise<DecouplingSuggestionResult[]> {
  const { tariffCode, currentRules, trips, targetDecouplingPct, currentPct, timeoutMs } = params;

  const baseline = simulatePortfolioDecouplingPct(currentRules, trips);
  const humanDesc = describeTranscriptMotRules(currentRules, "en");
  const stats = summarizeTripsForPrompt(currentRules, trips);

  const systemPrompt = `You are a taxi tariff analyst for the Israeli MOT client tariff model used in this CRM.

Output MUST be a single JSON object with key "suggestions" containing exactly 3 objects.

Each suggestion MUST include:
- "label": short title (English)
- "rationale": one or two sentences why this variant moves portfolio decoupling toward the target (English)
- "rules": a MOT rules object with shape:
  { "version": 1,
    "segments": [
      {
        "wrap": boolean,
        "fromHour": number, "fromMinute": number, "toHour": number, "toMinute": number,
        "model": either
          { "type": "linear", "base": number, "perKm": number }
          or
          { "type": "tiered_km", "base": number, "firstKm": number, "rateFirst": number, "rateAfter": number }
      }
    ]
  }

Rules:
- Trip times are interpreted in Asia/Jerusalem local time.
- Use "wrap": true only when the time window crosses midnight (e.g. 21:01–05:59).
- Segments are evaluated in array order; first matching segment wins (same as the engine).
- Prefer realistic positive prices; base and per-km rates are in ILS-like numeric units consistent with the current tariff scale.
- Produce THREE materially different strategies when possible (e.g. higher boarding vs steeper per-km vs different tier split vs night/day spread).

Do not include markdown or text outside JSON.`;

  const userPrompt = `Selected tariff code: ${tariffCode}

Current tariff rules (JSON):
${JSON.stringify(currentRules)}

Human-readable current tariff:
${humanDesc}

Trip stats (${trips.length} trips used for simulation):
- Sum of driver prices (fixed): ${baseline.sumDriver.toFixed(2)}
- Sum of client prices under CURRENT rules: ${baseline.sumClient.toFixed(2)}
- Portfolio decoupling % under CURRENT rules: ${currentPct.toFixed(4)}%
  (formula: (sumClient - sumDriver) / sumClient * 100)

Target portfolio decoupling % (same trips, same driver totals): ${targetDecouplingPct.toFixed(4)}%

Per-segment trip counts (which time band each trip falls into under CURRENT rules): ${JSON.stringify(stats.segmentCounts)}
Km: min ${stats.minKm}, max ${stats.maxKm}, avg ${stats.avgKm}, sum ${stats.sumKm}

Sample trips (subset for context only — full list is simulated server-side):
${stats.sampleTripsJson}

Return JSON: { "suggestions": [ {...}, {...}, {...} ] } with exactly 3 suggestions whose rules are valid and aim toward the target decoupling percentage on this portfolio.`;

  const raw = (await requestStructuredJson({
    systemPrompt,
    userPrompt,
    timeoutMs,
  })) as { suggestions?: unknown };

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid LLM response shape.");
  }
  const list = raw.suggestions;
  if (!Array.isArray(list) || list.length !== 3) {
    throw new Error('LLM must return exactly 3 items in "suggestions".');
  }

  const suggestions: DecouplingSuggestionResult[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") {
      throw new Error(`Suggestion ${i + 1} is not an object.`);
    }
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
    if (!label || !rationale) {
      throw new Error(`Suggestion ${i + 1} needs non-empty label and rationale.`);
    }
    const rules = parseTranscriptMotRules(o.rules);
    if (!rules) {
      throw new Error(`Suggestion ${i + 1} has invalid rules JSON.`);
    }
    const sim = simulatePortfolioDecouplingPct(rules, trips);
    suggestions.push({
      label,
      rationale,
      rules,
      simulatedPortfolioDecouplingPct: sim.portfolioPct,
      simulatedSumClient: sim.sumClient,
      deltaVsCurrentPct: sim.portfolioPct - currentPct,
    });
  }

  return suggestions;
}

export type DecouplingRunSource = "openai" | "deterministic";

export async function runDecouplingTariffSuggestions(params: {
  tariffCode: string;
  currentRules: TranscriptMotRules;
  trips: TripForDecouplingSimulation[];
  targetDecouplingPct: number;
  timeoutMs?: number;
}): Promise<{
  currentPortfolioDecouplingPct: number;
  suggestions: DecouplingSuggestionResult[];
  source: DecouplingRunSource;
  /** Present when source is deterministic (includes LLM error text or missing key). */
  deterministicNote?: string;
}> {
  const { tariffCode, currentRules, trips, targetDecouplingPct } = params;
  const timeoutMs = params.timeoutMs ?? Number(process.env.OPENAI_TARIFF_ANALYSIS_TIMEOUT_MS ?? "90000");

  const baseline = simulatePortfolioDecouplingPct(currentRules, trips);
  const currentPct = baseline.portfolioPct;

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (hasKey) {
    try {
      const suggestions = await runOpenAiDecouplingTariffSuggestions({
        tariffCode,
        currentRules,
        trips,
        targetDecouplingPct,
        currentPct,
        timeoutMs,
      });
      return {
        currentPortfolioDecouplingPct: currentPct,
        suggestions,
        source: "openai",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const suggestions = buildDeterministicDecouplingSuggestions({
        currentRules,
        trips,
        targetDecouplingPct,
        currentPct,
        sumClient: baseline.sumClient,
        sumDriver: baseline.sumDriver,
      });
      return {
        currentPortfolioDecouplingPct: currentPct,
        suggestions,
        source: "deterministic",
        deterministicNote: msg,
      };
    }
  }

  const suggestions = buildDeterministicDecouplingSuggestions({
    currentRules,
    trips,
    targetDecouplingPct,
    currentPct,
    sumClient: baseline.sumClient,
    sumDriver: baseline.sumDriver,
  });
  return {
    currentPortfolioDecouplingPct: currentPct,
    suggestions,
    source: "deterministic",
    deterministicNote: "OPENAI_API_KEY is not configured; using deterministic uniform-scale suggestions.",
  };
}
