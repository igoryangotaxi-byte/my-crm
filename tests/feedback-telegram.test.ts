import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  feedbackStatusKeyboard,
  parseFeedbackCallbackData,
} from "../lib/feedback/telegram-format.ts";

describe("feedback telegram callback encoding", () => {
  it("round-trips feedback id and status in callback_data", () => {
    const id = "695f9dce-4df7-4182-bef2-61ec1da93825";
    const keyboard = feedbackStatusKeyboard(id);
    const row = keyboard.inline_keyboard[0] ?? [];
    assert.equal(row.length, 3);

    for (const button of row) {
      const parsed = parseFeedbackCallbackData(button.callback_data);
      assert.ok(parsed);
      assert.equal(parsed.feedbackId, id);
      assert.ok(["todo", "in_progress", "done"].includes(parsed.status));
      assert.ok(button.callback_data.length <= 64);
    }
  });

  it("rejects malformed callback_data", () => {
    assert.equal(parseFeedbackCallbackData("nope"), null);
    assert.equal(parseFeedbackCallbackData("fb:abc:todo"), null);
  });
});
