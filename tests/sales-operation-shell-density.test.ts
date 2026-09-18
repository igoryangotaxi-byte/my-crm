import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UI_DENSITY,
  resolveUiDensity,
} from "@/lib/sales-operation/ui-density";

describe("sales operation shell density default", () => {
  it("defaults new/unset sessions to compact", () => {
    assert.equal(DEFAULT_UI_DENSITY, "compact");
    assert.equal(resolveUiDensity(null), "compact");
    assert.equal(resolveUiDensity(undefined), "compact");
    assert.equal(resolveUiDensity(""), "compact");
    assert.equal(resolveUiDensity("cozy"), "compact");
  });

  it("respects a saved compact or comfortable preference", () => {
    assert.equal(resolveUiDensity("compact"), "compact");
    assert.equal(resolveUiDensity("comfortable"), "comfortable");
  });
});
