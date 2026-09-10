import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUPPORT_CB_OPEN,
  SUPPORT_TICKET_TITLES,
  buildSupportTicketDescription,
  parseSupportTitleCallback,
  selectTitleKeyboard,
  supportTitleById,
  titleOptionsKeyboard,
} from "@/lib/telegram/support-flow";

describe("telegram support bot flow", () => {
  it("exposes four fixed titles", () => {
    assert.equal(SUPPORT_TICKET_TITLES.length, 4);
    assert.ok(SUPPORT_TICKET_TITLES.some((t) => t.label === "Change price and coupons"));
    assert.ok(SUPPORT_TICKET_TITLES.some((t) => t.label === "Technical problems in the app"));
    assert.ok(SUPPORT_TICKET_TITLES.some((t) => t.label === "Bad service from the driver"));
    assert.ok(SUPPORT_TICKET_TITLES.some((t) => t.label === "Other"));
  });

  it("builds select + title option keyboards", () => {
    const open = selectTitleKeyboard();
    assert.equal(open.inline_keyboard[0]?.[0]?.callback_data, SUPPORT_CB_OPEN);
    assert.equal(open.inline_keyboard[0]?.[0]?.text, "Select the Title");

    const titles = titleOptionsKeyboard();
    assert.equal(titles.inline_keyboard.length, 4);
    assert.equal(parseSupportTitleCallback("sup:t:price"), "price");
    assert.equal(supportTitleById("tech"), "Technical problems in the app");
    assert.equal(parseSupportTitleCallback("sup:t:nope"), null);
  });

  it("tags description with telegram identity", () => {
    const body = buildSupportTicketDescription({
      description: "App crashes on login",
      telegramUserId: 42,
      telegramUsername: "igor",
      telegramName: "Igor K",
    });
    assert.match(body, /App crashes on login/);
    assert.match(body, /Telegram support bot/);
    assert.match(body, /@igor/);
    assert.match(body, /id:42/);
  });
});
