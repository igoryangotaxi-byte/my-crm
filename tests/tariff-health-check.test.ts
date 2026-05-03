import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTieredTariffSuggestions,
  computeTripPriceTiered,
  parseTariffHealthIntent,
} from "../lib/tariff-health-check";

test("fallback parser extracts metric, month, year and corp_client_id", async () => {
  const intent = await parseTariffHealthIntent(
    "подсчитай Decoupling Rate за март 2026 года у клиента efde93876387425c85161a64288537e8",
  );

  assert.equal(intent.metric, "decoupling_rate");
  assert.equal(intent.corpClientId, "efde93876387425c85161a64288537e8");
  assert.equal(intent.period.label, "2026-03");
  assert.equal(intent.period.fromIso, "2026-03-01T00:00:00.000Z");
  assert.equal(intent.period.toIsoExclusive, "2026-04-01T00:00:00.000Z");
});

test("computeTripPriceTiered applies km bands in order (ladder example)", () => {
  const tariff = {
    basePrice: 10,
    bands: [
      { km: 5, ratePerKm: 1 },
      { km: 5, ratePerKm: 2 },
      { km: null, ratePerKm: 3 },
    ],
  };
  assert.equal(computeTripPriceTiered(15, tariff), 40);
  assert.equal(computeTripPriceTiered(3, tariff), 13);
});

test("buildTieredTariffSuggestions returns tiered tariffs when revenue headroom exists", () => {
  const trips = [
    { km: 10, clientPaid: 100, driverCost: 70, decouplingAbs: 30 },
    { km: 20, clientPaid: 200, driverCost: 140, decouplingAbs: 60 },
  ];
  const { suggestions, assumptions } = buildTieredTariffSuggestions(trips, 35);
  assert.ok(suggestions.length >= 1);
  assert.ok(suggestions[0].tariff.basePrice >= 0);
  assert.ok(suggestions[0].tariff.bands.length >= 1);
  assert.ok(assumptions.some((item) => item.includes("Driver tariff")));
});

test("buildTieredTariffSuggestions metrics reflect delta vs actual on synthetic portfolio", () => {
  const trips = [
    { km: 10, clientPaid: 100, driverCost: 70, decouplingAbs: 30 },
    { km: 10, clientPaid: 100, driverCost: 70, decouplingAbs: 30 },
  ];
  const { suggestions } = buildTieredTariffSuggestions(trips, 40);
  assert.ok(suggestions.length >= 1);
  const m = suggestions[0].metrics;
  const actualTotal = trips.reduce((sum, trip) => sum + trip.clientPaid, 0);
  assert.ok(Math.abs(m.deltaVsActualTotal - (m.simulatedTotal - actualTotal)) < 1e-6);
});

test("buildTieredTariffSuggestions returns empty when target decoupling already met", () => {
  const trips = [{ km: 5, clientPaid: 100, driverCost: 10, decouplingAbs: 90 }];
  const { suggestions, assumptions } = buildTieredTariffSuggestions(trips, 5);
  assert.equal(suggestions.length, 0);
  assert.ok(assumptions.some((a) => a.includes("уже достигает")));
});
