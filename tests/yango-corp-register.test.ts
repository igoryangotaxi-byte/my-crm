import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isYangoCorpRegisterSignal,
  isYangoWidgetOrigin,
  yangoCorpRegisterStorageKey,
} from "@/lib/sales-operation/yango-corp-register";

describe("yango corp register helpers", () => {
  it("builds a per-lead storage key", () => {
    assert.equal(yangoCorpRegisterStorageKey("lead-1"), "yango-corp-register:lead-1");
  });

  it("accepts completion signals", () => {
    assert.equal(
      isYangoCorpRegisterSignal({ type: "yango-corp-register", leadId: "lead-1", completedAt: "2026-08-13" }),
      true,
    );
    assert.equal(isYangoCorpRegisterSignal({ type: "other", leadId: "lead-1" }), false);
  });

  it("recognizes Yandex/Yango widget origins", () => {
    assert.equal(isYangoWidgetOrigin("https://yastatic.net"), true);
    assert.equal(isYangoWidgetOrigin("https://forms.yango.com"), true);
    assert.equal(isYangoWidgetOrigin("https://example.com"), false);
  });
});
