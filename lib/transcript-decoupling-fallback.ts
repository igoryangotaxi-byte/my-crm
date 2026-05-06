import type {
  TranscriptMotPricingModel,
  TranscriptMotRules,
  TranscriptMotSegment,
} from "@/lib/transcript-mot-tariff-rules";
import type { DecouplingSuggestionResult, TripForDecouplingSimulation } from "@/lib/transcript-decoupling-shared";
import { simulatePortfolioDecouplingPct } from "@/lib/transcript-decoupling-shared";

/** Multiply every base and km-related rate by `factor`; time windows unchanged. */
export function scaleTranscriptMotRules(rules: TranscriptMotRules, factor: number): TranscriptMotRules {
  return {
    version: 1,
    segments: rules.segments.map((seg): TranscriptMotSegment => ({
      ...seg,
      model: scaleModel(seg.model, factor),
    })),
  };
}

function scaleModel(model: TranscriptMotPricingModel, factor: number): TranscriptMotPricingModel {
  if (model.type === "linear") {
    return { type: "linear", base: model.base * factor, perKm: model.perKm * factor };
  }
  return {
    type: "tiered_km",
    base: model.base * factor,
    firstKm: model.firstKm,
    rateFirst: model.rateFirst * factor,
    rateAfter: model.rateAfter * factor,
  };
}

/**
 * Uniform scale f on all client prices implies sumClient' = f * sumClient₀, hence
 * portfolioPct = (f·S_c − S_d) / (f·S_c) × 100. Solving for target pct T gives
 * f = S_d / (S_c × (1 − T/100)) when T < 100 and S_c > 0.
 */
export function uniformScaleFactorForPortfolioDecouplingPct(
  sumClient: number,
  sumDriver: number,
  targetPct: number,
): number | null {
  if (!(sumClient > 0) || !Number.isFinite(sumClient) || !Number.isFinite(sumDriver)) {
    return null;
  }
  const T = clamp(targetPct, -99.99, 99.99);
  const r = T / 100;
  if (r >= 1) {
    if (sumDriver <= 1e-12) return 1;
    return null;
  }
  const denom = sumClient * (1 - r);
  if (!(denom > 0)) return null;
  const f = sumDriver / denom;
  if (!Number.isFinite(f) || f <= 0) return null;
  return f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type BuildDeterministicArgs = {
  currentRules: TranscriptMotRules;
  trips: TripForDecouplingSimulation[];
  targetDecouplingPct: number;
  currentPct: number;
  sumClient: number;
  sumDriver: number;
};

/** Three uniform-scale variants: exact target, target−0.5pp, target+0.5pp (Tariff-Health-style resilience without LLM). */
export function buildDeterministicDecouplingSuggestions(args: BuildDeterministicArgs): DecouplingSuggestionResult[] {
  const { currentRules, trips, targetDecouplingPct, currentPct, sumClient, sumDriver } = args;

  const deltas = [0, -0.5, 0.5] as const;
  const labels = [
    "Uniform scale (matches target %)",
    "Uniform scale (target − 0.5 pp)",
    "Uniform scale (target + 0.5 pp)",
  ] as const;

  const seenFactors = new Set<string>();
  const out: DecouplingSuggestionResult[] = [];

  for (let i = 0; i < 3; i++) {
    const targetT = clamp(targetDecouplingPct + deltas[i]!, -99.99, 99.99);
    let f = uniformScaleFactorForPortfolioDecouplingPct(sumClient, sumDriver, targetT);

    if (f == null && deltas[i] !== 0) {
      f = uniformScaleFactorForPortfolioDecouplingPct(sumClient, sumDriver, targetDecouplingPct);
    }
    if (f == null) {
      f = 1;
    }

    const key = f.toFixed(8);
    if (seenFactors.has(key) && i > 0) {
      const bump = (i === 1 ? -0.001 : 0.001) * Math.max(0.01, Math.abs(targetDecouplingPct) || 1);
      const altT = clamp(targetDecouplingPct + deltas[i]! + bump, -99.99, 99.99);
      const f2 = uniformScaleFactorForPortfolioDecouplingPct(sumClient, sumDriver, altT);
      if (f2 != null && !seenFactors.has(f2.toFixed(8))) {
        f = f2;
      }
    }
    seenFactors.add(f.toFixed(8));

    const rules = scaleTranscriptMotRules(currentRules, f);
    const sim = simulatePortfolioDecouplingPct(rules, trips);

    out.push({
      label: labels[i]!,
      rationale:
        "Deterministic fallback (no LLM): every segment's boarding fee and km rates are multiplied by the same factor so portfolio decoupling moves toward the goal on this fixed trip set; driver totals are unchanged.",
      rules,
      simulatedPortfolioDecouplingPct: sim.portfolioPct,
      simulatedSumClient: sim.sumClient,
      deltaVsCurrentPct: sim.portfolioPct - currentPct,
    });
  }

  return out;
}
