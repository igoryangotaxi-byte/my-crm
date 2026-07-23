import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SIGNED_AM_EMAIL,
  ONBOARDING_FIRST_TOUCH_TITLE,
  SIGNED_LAUNCH_CHECKLIST_TITLES,
  buildLaunchTicketTitle,
  nextBusinessDayMeetingWindow,
  pickDefaultAccountManager,
} from "../lib/sales-operation/signed-handover.ts";

describe("signed B2B handover helpers", () => {
  it("exports the fixed launch checklist in English", () => {
    assert.deepEqual([...SIGNED_LAUNCH_CHECKLIST_TITLES], [
      "Tariff setup",
      "Credit limit setup",
      "Review/configure special client conditions (if any)",
      "Obtain/connect credit card",
      "Review contract and agreed terms",
    ]);
    assert.equal(SIGNED_LAUNCH_CHECKLIST_TITLES.length, 5);
  });

  it("uses Onboarding + First Touch title", () => {
    assert.equal(ONBOARDING_FIRST_TOUCH_TITLE, "Onboarding + First Touch");
  });

  it("builds launch ticket titles", () => {
    assert.equal(buildLaunchTicketTitle("Acme Corp"), "Launch prep — Acme Corp");
    assert.equal(buildLaunchTicketTitle("  "), "Launch prep — Client");
  });

  it("prefers explicit AM, then settings, then email fallback", () => {
    assert.deepEqual(
      pickDefaultAccountManager({
        settingsUserId: "settings-am",
        settingsName: "Settings AM",
        fallbackUser: { id: "fallback", name: "Fallback" },
        explicit: { userId: "gate-am", name: "Gate AM" },
      }),
      { userId: "gate-am", name: "Gate AM", source: "explicit" },
    );

    assert.deepEqual(
      pickDefaultAccountManager({
        settingsUserId: "settings-am",
        settingsName: "Settings AM",
        fallbackUser: { id: "fallback", name: "Fallback" },
      }),
      { userId: "settings-am", name: "Settings AM", source: "settings" },
    );

    assert.deepEqual(
      pickDefaultAccountManager({
        settingsUserId: null,
        settingsName: null,
        fallbackUser: { id: "fallback", name: "Igor Rebkovets" },
      }),
      { userId: "fallback", name: "Igor Rebkovets", source: "email_fallback" },
    );

    assert.equal(
      pickDefaultAccountManager({
        settingsUserId: null,
        settingsName: null,
        fallbackUser: null,
      }),
      null,
    );
  });

  it("documents the default AM email fallback", () => {
    assert.equal(DEFAULT_SIGNED_AM_EMAIL, "igorrebkovets@appli.taxi");
  });

  it("schedules a weekday morning 45-minute meeting window", () => {
    // Friday 2026-07-24 → Monday 2026-07-27 10:00 local
    const friday = new Date(2026, 6, 24, 15, 30, 0);
    const window = nextBusinessDayMeetingWindow(friday);
    const start = new Date(window.startsAt);
    const end = new Date(window.endsAt);
    assert.equal(start.getDay(), 1); // Monday
    assert.equal(start.getHours(), 10);
    assert.equal(end.getTime() - start.getTime(), 45 * 60 * 1000);
  });
});
