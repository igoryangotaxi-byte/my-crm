import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertStageRequirements,
  StageRequirementError,
  validateStageRequirements,
} from "../lib/sales-operation/status-transitions.ts";
import { readCreateTaskData } from "../lib/sales-operation/automation/graph.ts";
import { AUTOMATION_NODE_TYPES } from "../lib/sales-operation/automation/types.ts";

describe("sales operation notifications (Phase 6)", () => {
  it("migration creates the notifications table with a user index", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_notifications.sql"),
      "utf8",
    );
    assert.match(sql, /create table if not exists public\.sales_notifications/);
    assert.match(sql, /references public\.sales_leads \(id\) on delete cascade/);
    assert.match(sql, /create index if not exists sales_notifications_user_idx/);
  });

  it("registers the notifications migration in the apply scripts", () => {
    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_notifications\.sql/);
  });

  it("ships notification + automation task translations for both locales", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as {
        salesOperation?: {
          notifications?: Record<string, unknown>;
          automation?: Record<string, unknown>;
        };
      };
      const so = messages.salesOperation;
      assert.ok(so?.notifications, `${locale}: missing salesOperation.notifications`);
      for (const key of ["title", "markAllRead", "empty"]) {
        assert.ok(
          key in (so.notifications as Record<string, unknown>),
          `${locale}: missing notifications.${key}`,
        );
      }
      for (const key of ["addTask", "taskTitle", "taskDueInDays", "taskAssignToOwner"]) {
        assert.ok(
          key in (so.automation as Record<string, unknown>),
          `${locale}: missing automation.${key}`,
        );
      }
    }
  });
});

describe("sales operation stage requirements (Phase 6)", () => {
  it("requires monthly potential before proposal_sent / negotiation", () => {
    assert.deepEqual(validateStageRequirements("proposal_sent", {}), [
      "estimatedMonthlyPotential",
    ]);
    assert.deepEqual(
      validateStageRequirements("negotiation", { estimatedMonthlyPotential: 0 }),
      ["estimatedMonthlyPotential"],
    );
    assert.deepEqual(
      validateStageRequirements("proposal_sent", { estimatedMonthlyPotential: 5000 }),
      [],
    );
  });

  it("does not gate non-proposal stages", () => {
    assert.deepEqual(validateStageRequirements("in_progress", {}), []);
    assert.deepEqual(validateStageRequirements("signed", {}), []);
    assert.deepEqual(validateStageRequirements("rejected", {}), []);
  });

  it("assertStageRequirements throws a typed error with missing fields", () => {
    assert.throws(
      () => assertStageRequirements("proposal_sent", { estimatedMonthlyPotential: null }),
      (error: unknown) =>
        error instanceof StageRequirementError &&
        error.missing.includes("estimatedMonthlyPotential"),
    );
    assert.doesNotThrow(() =>
      assertStageRequirements("proposal_sent", { estimatedMonthlyPotential: 1200 }),
    );
  });
});

describe("sales operation automation create-task node (Phase 6)", () => {
  it("registers the actionCreateTask node type", () => {
    assert.ok((AUTOMATION_NODE_TYPES as readonly string[]).includes("actionCreateTask"));
  });

  it("reads create-task config with sane defaults", () => {
    const defaults = readCreateTaskData({ id: "n1", data: {} } as never);
    assert.equal(defaults.title, "");
    assert.equal(defaults.taskType, "todo");
    assert.equal(defaults.priority, "normal");
    assert.equal(defaults.dueInDays, 1);
    assert.equal(defaults.assignToLeadOwner, true);

    const custom = readCreateTaskData({
      id: "n2",
      data: {
        title: "Call {{full_name}}",
        taskType: "call",
        priority: "high",
        dueInDays: 3,
        assignToLeadOwner: false,
      },
    } as never);
    assert.equal(custom.title, "Call {{full_name}}");
    assert.equal(custom.taskType, "call");
    assert.equal(custom.priority, "high");
    assert.equal(custom.dueInDays, 3);
    assert.equal(custom.assignToLeadOwner, false);
  });
});
