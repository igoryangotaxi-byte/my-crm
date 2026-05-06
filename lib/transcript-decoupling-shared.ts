import { evaluateTranscriptMotClientPrice, type TranscriptMotRules } from "@/lib/transcript-mot-tariff-rules";

export type TripForDecouplingSimulation = {
  km: number;
  tripIso: string;
  driverPrice: number;
};

export type DecouplingSuggestionResult = {
  label: string;
  rationale: string;
  rules: TranscriptMotRules;
  simulatedPortfolioDecouplingPct: number;
  simulatedSumClient: number;
  deltaVsCurrentPct: number;
};

export function simulatePortfolioDecouplingPct(
  rules: TranscriptMotRules,
  trips: TripForDecouplingSimulation[],
): { portfolioPct: number; sumClient: number; sumDriver: number } {
  let sumClient = 0;
  let sumDriver = 0;
  for (const t of trips) {
    sumDriver += t.driverPrice;
    sumClient += evaluateTranscriptMotClientPrice(rules, t.km, new Date(t.tripIso));
  }
  const portfolioPct = sumClient > 0 ? ((sumClient - sumDriver) / sumClient) * 100 : 0;
  return { portfolioPct, sumClient, sumDriver };
}
