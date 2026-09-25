import assert from "node:assert/strict";
import { parseDriverReceivedRaw } from "../lib/drivers-pipeline/received-at";

const now = new Date(2026, 8, 25, 14, 0, 0); // 25 Sep 2026

// Unambiguous DD/MM (day > 12)
const lateSep = parseDriverReceivedRaw("25/09/2026 16:31", { now });
assert.ok(lateSep);
assert.equal(lateSep.getFullYear(), 2026);
assert.equal(lateSep.getMonth(), 8);
assert.equal(lateSep.getDate(), 25);

// Ambiguous: 09/12 as DD/MM would be 9 Dec (future) → prefer MM/DD = 12 Sep
const ambiguousUs = parseDriverReceivedRaw("09/12/2026 16:31", { now });
assert.ok(ambiguousUs);
assert.equal(ambiguousUs.getMonth(), 8);
assert.equal(ambiguousUs.getDate(), 12);

// Explicit IL DD/MM for Sept 12 stays Sept 12
const ilSept = parseDriverReceivedRaw("12/09/2026 16:31", { now });
assert.ok(ilSept);
assert.equal(ilSept.getMonth(), 8);
assert.equal(ilSept.getDate(), 12);

// Real December date in the past (relative to a Dec "now") stays December
const inDecember = new Date(2026, 11, 20, 12, 0, 0);
const realDec = parseDriverReceivedRaw("09/12/2026 16:31", { now: inDecember });
assert.ok(realDec);
assert.equal(realDec.getMonth(), 11);
assert.equal(realDec.getDate(), 9);

console.log("drivers-received-at.test.ts: ok");
