import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { canTracker } from "@/lib/sales-operation/tracker-permissions";
import {
  normalizeTrackerLinkType,
  normalizeTrackerPriority,
} from "@/lib/sales-operation/tracker";
import { DEFAULT_TRACKER_STATUSES } from "@/lib/sales-operation/tracker-types";
import { CURRENT_PERMISSIONS_VERSION, SALES_OPERATION_PAGE_KEYS } from "@/lib/role-permissions";
import { defaultRolePermissions } from "@/types/auth";

describe("sales operation tracker MVP", () => {
  it("registers tracker SQL in apply script", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_tracker.sql"),
      "utf8",
    );
    assert.match(sql, /create table if not exists public\.tracker_projects/);
    assert.match(sql, /create table if not exists public\.tracker_tickets/);
    assert.match(sql, /create table if not exists public\.tracker_statuses/);
    assert.match(sql, /create table if not exists public\.tracker_ticket_assignees/);

    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_tracker\.sql/);
  });

  it("exposes salesTracker page key and defaults", () => {
    assert.ok((SALES_OPERATION_PAGE_KEYS as readonly string[]).includes("salesTracker"));
    assert.equal(CURRENT_PERMISSIONS_VERSION, 12);
    assert.equal(defaultRolePermissions.Admin.salesTracker, true);
    assert.equal(defaultRolePermissions["Account Manager"].salesTracker, true);
    assert.equal(defaultRolePermissions.User.salesTracker, false);
  });

  it("normalizes priority and link types", () => {
    assert.equal(normalizeTrackerPriority("urgent"), "urgent");
    assert.equal(normalizeTrackerPriority("nope"), "normal");
    assert.equal(normalizeTrackerLinkType("blocks"), "blocks");
    assert.equal(normalizeTrackerLinkType("nope"), null);
  });

  it("seeds five default statuses with a done column", () => {
    assert.equal(DEFAULT_TRACKER_STATUSES.length, 5);
    assert.ok(DEFAULT_TRACKER_STATUSES.some((s) => s.isDone && s.name === "Done"));
  });

  it("applies tracker action matrix by role", () => {
    assert.equal(canTracker("editBoard", "Admin"), true);
    assert.equal(canTracker("deleteTickets", "Admin"), true);
    assert.equal(canTracker("deleteTickets", "Sales Manager"), true);
    assert.equal(canTracker("editStatuses", "Team Lead"), true);
    assert.equal(canTracker("editBoard", "User"), false);
    assert.equal(canTracker("createTickets", "User"), true);
    assert.equal(canTracker("deleteTickets", "User"), true);
  });

  it("ships tracker translations", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as {
        salesOperation?: {
          tab?: { tracker?: string };
          tracker?: Record<string, unknown>;
          mySpace?: { tab?: { tracker?: string } };
        };
      };
      assert.ok(messages.salesOperation?.tab?.tracker, `${locale}: missing tab.tracker`);
      assert.ok(messages.salesOperation?.tracker?.title, `${locale}: missing tracker.title`);
      assert.ok(messages.salesOperation?.mySpace?.tab?.tracker, `${locale}: missing mySpace.tab.tracker`);
    }
  });
});
