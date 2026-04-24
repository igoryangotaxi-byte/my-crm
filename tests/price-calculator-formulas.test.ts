import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateMoneTariff,
  calculateYangoDriversTariff,
  parseTimeToMinutes,
  type WeekdayKey,
} from "../lib/price-calculator-formulas";

function mustParseTime(value: string) {
  const parsed = parseTimeToMinutes(value);
  assert.notEqual(parsed, null, `Expected valid time, got ${value}`);
  return parsed;
}

function approxEqual(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${expected}, got ${actual}`,
  );
}

function runCase(km: number, mins: number, day: WeekdayKey, time: string) {
  const timeMinutes = mustParseTime(time);
  const yango = calculateYangoDriversTariff(km, mins, day, timeMinutes);
  const mone = calculateMoneTariff(km, mins, day, timeMinutes);
  return { yango, mone };
}

test("parses HH:mm to minutes with bounds checks", () => {
  assert.equal(parseTimeToMinutes("00:00"), 0);
  assert.equal(parseTimeToMinutes("05:59"), 359);
  assert.equal(parseTimeToMinutes("23:59"), 1439);
  assert.equal(parseTimeToMinutes("24:00"), null);
  assert.equal(parseTimeToMinutes("12:60"), null);
  assert.equal(parseTimeToMinutes("9:00"), null);
});

test("weekday daytime case matches expected totals (Monday 10:00)", () => {
  const { yango, mone } = runCase(12, 30, "monday", "10:00");
  approxEqual(yango.total, 103.82);
  approxEqual(mone.total, 103.82);
});

test("weekday night case matches expected totals (Tuesday 23:00)", () => {
  const { yango, mone } = runCase(12, 30, "tuesday", "23:00");
  approxEqual(yango.total, 120.2);
  approxEqual(mone.total, 120.2);
});

test("Friday boundary 15:59 and 16:01 switches rate bands", () => {
  const before = runCase(12, 30, "friday", "15:59");
  const after = runCase(12, 30, "friday", "16:01");

  approxEqual(before.yango.rate1, 1.95);
  approxEqual(before.yango.rate2, 3.79);
  approxEqual(after.yango.rate1, 2.34);
  approxEqual(after.yango.rate2, 4.18);

  approxEqual(before.mone.rateA, 1.95);
  approxEqual(before.mone.rateB, 3.79);
  approxEqual(after.mone.rateA, 2.34);
  approxEqual(after.mone.rateB, 4.18);
});

test("Friday night boundary differs exactly as spreadsheet rules", () => {
  const at2100 = runCase(12, 30, "friday", "21:00");
  const at2101 = runCase(12, 30, "friday", "21:01");

  // Yango: Friday 21:00 is night (>=21:00), Friday 21:01 remains night.
  approxEqual(at2100.yango.total, 136.58);
  approxEqual(at2101.yango.total, 136.58);

  // Mone: Friday 21:00 still in 16:01-21:00 band, 21:01 moves to night premium.
  approxEqual(at2100.mone.total, 120.2);
  approxEqual(at2101.mone.total, 136.58);
});

test("Saturday boundary 19:00 and 19:01 switches mone rate", () => {
  const at1900 = runCase(12, 30, "saturday", "19:00");
  const at1901 = runCase(12, 30, "saturday", "19:01");

  approxEqual(at1900.mone.rateA, 2.34);
  approxEqual(at1901.mone.rateA, 2.73);
  approxEqual(at1900.mone.total, 120.2);
  approxEqual(at1901.mone.total, 136.58);
});

test("delta percent sign logic is correct", () => {
  const lowMone = runCase(12, 30, "friday", "21:00");
  const highMone = runCase(12, 30, "friday", "21:01");

  const lowDelta = lowMone.mone.total - lowMone.yango.total;
  const lowPct = (lowDelta / lowMone.yango.total) * 100;
  assert.ok(lowDelta < 0);
  assert.ok(lowPct < 0);

  const highDelta = highMone.mone.total - highMone.yango.total;
  const highPct = (highDelta / highMone.yango.total) * 100;
  approxEqual(highDelta, 0);
  approxEqual(highPct, 0);
});
