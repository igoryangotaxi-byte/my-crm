import test from "node:test";
import assert from "node:assert/strict";

import { TRANSCRIPT_MOT_TARIFF_CATALOG } from "../lib/transcript-mot-tariff-catalog";
import {
  evaluateTranscriptMotClientPrice,
  findMatchingSegmentIndex,
  getJerusalemMinuteOfDay,
} from "../lib/transcript-mot-tariff-rules";

function rulesByCode(code: string) {
  const row = TRANSCRIPT_MOT_TARIFF_CATALOG.find((r) => r.code === code);
  assert.ok(row, `missing ${code}`);
  return row.rules;
}

test("Main-ISR-2023-MOT linear all day", () => {
  const rules = rulesByCode("Main-ISR-2023-MOT");
  const trip = new Date("2026-01-15T12:00:00+02:00");
  const price = evaluateTranscriptMotClientPrice(rules, 10, trip);
  assert.ok(Math.abs(price - (58.9 + 10 * 5.9)) < 1e-6);
});

test("SPECIAL_MOT_MONE_ISRAYOM day tier vs night linear", () => {
  const rules = rulesByCode("SPECIAL_MOT_MONE_ISRAYOM");
  const dayTrip = new Date("2026-06-15T10:00:00+03:00");
  const nightTrip = new Date("2026-06-15T22:00:00+03:00");
  const km = 12;
  const dayPrice = evaluateTranscriptMotClientPrice(rules, km, dayTrip);
  const nightPrice = evaluateTranscriptMotClientPrice(rules, km, nightTrip);
  const expectedDay = 54 + 10 * 5.31 + 2 * 7.08;
  const expectedNight = 54 + 12 * 5.9;
  assert.ok(Math.abs(dayPrice - expectedDay) < 1e-6, `day ${dayPrice} vs ${expectedDay}`);
  assert.ok(Math.abs(nightPrice - expectedNight) < 1e-6, `night ${nightPrice} vs ${expectedNight}`);
  assert.notEqual(Math.round(dayPrice * 100), Math.round(nightPrice * 100));
});

test("SPECIAL_MOT_MONE_Shufersal day window vs wrap night window", () => {
  const rules = rulesByCode("SPECIAL_MOT_MONE_Shufersal");
  const noon = new Date("2026-06-15T12:00:00+03:00");
  const late = new Date("2026-06-15T22:00:00+03:00");
  const km = 10;
  const dayPrice = evaluateTranscriptMotClientPrice(rules, km, noon);
  const nightPrice = evaluateTranscriptMotClientPrice(rules, km, late);
  assert.ok(Math.abs(dayPrice - (50 + 10 * 5.4)) < 1e-6);
  assert.ok(Math.abs(nightPrice - (50 + 10 * 4.5)) < 1e-6);
});

test("SPECIAL_MOT_MONE_Shufersal 15:00 in day segment, 15:01 in wrap segment", () => {
  const rules = rulesByCode("SPECIAL_MOT_MONE_Shufersal");
  const edgeDay = new Date("2026-06-15T15:00:00+03:00");
  const edgeNight = new Date("2026-06-15T15:01:00+03:00");
  assert.equal(getJerusalemMinuteOfDay(edgeDay), 15 * 60);
  assert.equal(getJerusalemMinuteOfDay(edgeNight), 15 * 60 + 1);
  const km = 5;
  const p1500 = evaluateTranscriptMotClientPrice(rules, km, edgeDay);
  const p1501 = evaluateTranscriptMotClientPrice(rules, km, edgeNight);
  assert.ok(Math.abs(p1500 - (50 + 5 * 5.4)) < 1e-6);
  assert.ok(Math.abs(p1501 - (50 + 5 * 4.5)) < 1e-6);
});

test("findMatchingSegmentIndex aligns with ISRAYOM day/night", () => {
  const rules = rulesByCode("SPECIAL_MOT_MONE_ISRAYOM");
  const day = new Date("2026-06-15T10:00:00+03:00");
  const night = new Date("2026-06-15T22:00:00+03:00");
  assert.equal(findMatchingSegmentIndex(rules, day), 0);
  assert.equal(findMatchingSegmentIndex(rules, night), 1);
});

test("SPECIAL_MOT_MONE_ISRAYOM 21:00 day tier, 21:01 night linear", () => {
  const rules = rulesByCode("SPECIAL_MOT_MONE_ISRAYOM");
  const d2100 = new Date("2026-06-15T21:00:00+03:00");
  const d2101 = new Date("2026-06-15T21:01:00+03:00");
  assert.equal(getJerusalemMinuteOfDay(d2100), 21 * 60);
  assert.equal(getJerusalemMinuteOfDay(d2101), 21 * 60 + 1);
  const km = 11;
  const tier = evaluateTranscriptMotClientPrice(rules, km, d2100);
  const linear = evaluateTranscriptMotClientPrice(rules, km, d2101);
  const expectedTier = 54 + 10 * 5.31 + 1 * 7.08;
  const expectedLinear = 54 + 11 * 5.9;
  assert.ok(Math.abs(tier - expectedTier) < 1e-6);
  assert.ok(Math.abs(linear - expectedLinear) < 1e-6);
});
