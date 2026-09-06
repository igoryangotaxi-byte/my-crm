import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  DEFAULT_PUBLIC_TRACKER_PROJECT_ID,
  DEFAULT_PUBLIC_TRACKER_STATUS_NAME,
  buildPublicTicketDescription,
  consumePublicTicketRateLimit,
  findPublicTargetStatus,
  normalizePublicPriority,
  resetPublicTicketRateLimitForTests,
  validatePublicTicketFields,
} from "@/lib/sales-operation/public-ticket-form";
import type { TrackerStatus } from "@/lib/sales-operation/tracker-types";

function status(partial: Partial<TrackerStatus> & { name: string }): TrackerStatus {
  return {
    id: partial.id ?? "s1",
    projectId: partial.projectId ?? "p1",
    name: partial.name,
    color: partial.color ?? "#3b82f6",
    position: partial.position ?? 0,
    wipLimit: partial.wipLimit ?? null,
    isDone: partial.isDone ?? false,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("public ticket form", () => {
  beforeEach(() => {
    resetPublicTicketRateLimitForTests();
  });

  it("targets the Appli Tracker project and To Do column by default", () => {
    assert.equal(DEFAULT_PUBLIC_TRACKER_PROJECT_ID, "2cc7d354-1f6f-42d5-bb37-1efd6768f689");
    assert.equal(DEFAULT_PUBLIC_TRACKER_STATUS_NAME, "To Do");
  });

  it("finds To Do status case-insensitively", () => {
    const statuses = [
      status({ id: "backlog", name: "Backlog", position: 0 }),
      status({ id: "todo", name: "to do", position: 1 }),
      status({ id: "done", name: "Done", isDone: true, position: 2 }),
    ];
    assert.equal(findPublicTargetStatus(statuses, "To Do")?.id, "todo");
    assert.equal(findPublicTargetStatus(statuses, "Missing"), null);
  });

  it("validates title and description", () => {
    assert.equal(validatePublicTicketFields({ title: "", description: "x" }).ok, false);
    assert.equal(validatePublicTicketFields({ title: "Hi", description: "" }).ok, false);
    const ok = validatePublicTicketFields({ title: "  Need help  ", description: " Details " });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.title, "Need help");
      assert.equal(ok.description, "Details");
    }
  });

  it("normalizes priority and tags description", () => {
    assert.equal(normalizePublicPriority("urgent"), "urgent");
    assert.equal(normalizePublicPriority("nope"), "normal");
    assert.match(buildPublicTicketDescription("Hello"), /Submitted via public form/);
  });

  it("rate-limits by IP", () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(consumePublicTicketRateLimit("1.2.3.4"), true);
    }
    assert.equal(consumePublicTicketRateLimit("1.2.3.4"), false);
    assert.equal(consumePublicTicketRateLimit("9.9.9.9"), true);
  });
});
