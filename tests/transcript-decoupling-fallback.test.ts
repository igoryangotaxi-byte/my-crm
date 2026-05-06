import assert from "node:assert/strict";
import test from "node:test";

import { TRANSCRIPT_MOT_TARIFF_CATALOG } from "../lib/transcript-mot-tariff-catalog";
import {
  buildDeterministicDecouplingSuggestions,
  scaleTranscriptMotRules,
  uniformScaleFactorForPortfolioDecouplingPct,
} from "../lib/transcript-decoupling-fallback";
import { simulatePortfolioDecouplingPct } from "../lib/transcript-decoupling-shared";

test("uniformScaleFactorForPortfolioDecouplingPct hits algebraic target", () => {
  const sumClient = 1000;
  const sumDriver = 800;
  const targetPct = 30;
  const f = uniformScaleFactorForPortfolioDecouplingPct(sumClient, sumDriver, targetPct);
  assert.ok(f != null);
  const pct = ((f! * sumClient - sumDriver) / (f! * sumClient)) * 100;
  assert.ok(Math.abs(pct - targetPct) < 1e-9);
});

test("scaled rules triple portfolio client sum when factor is 3", () => {
  const rules = TRANSCRIPT_MOT_TARIFF_CATALOG.find((r) => r.code === "SPECIAL_MOT_MONE_ISRAYOM")!.rules;
  const tripAt = new Date("2026-06-15T10:00:00+03:00");
  const km = 12;
  const trips = [{ km, tripIso: tripAt.toISOString(), driverPrice: 100 }];
  const a = simulatePortfolioDecouplingPct(rules, trips);
  const scaled = scaleTranscriptMotRules(rules, 3);
  const b = simulatePortfolioDecouplingPct(scaled, trips);
  assert.ok(Math.abs(b.sumClient - 3 * a.sumClient) < 1e-6);
});

test("buildDeterministicDecouplingSuggestions returns three rows", () => {
  const rules = TRANSCRIPT_MOT_TARIFF_CATALOG.find((r) => r.code === "SPECIAL_MOT_MONE_ISRAYOM")!.rules;
  const tripAt = new Date("2026-06-15T10:00:00+03:00");
  const trips = Array.from({ length: 5 }, () => ({
    km: 8,
    tripIso: tripAt.toISOString(),
    driverPrice: 70,
  }));
  const base = simulatePortfolioDecouplingPct(rules, trips);
  const list = buildDeterministicDecouplingSuggestions({
    currentRules: rules,
    trips,
    targetDecouplingPct: base.portfolioPct + 3,
    currentPct: base.portfolioPct,
    sumClient: base.sumClient,
    sumDriver: base.sumDriver,
  });
  assert.equal(list.length, 3);
  assert.ok(list.every((s) => s.rules.version === 1));
});
