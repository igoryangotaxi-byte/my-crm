import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  normalizeTaskPriority,
  normalizeTaskStatus,
  normalizeTaskType,
  sortTasks,
  taskDueBucket,
} from "@/lib/sales-operation/task-utils";
import type { SalesTask } from "@/lib/sales-operation/types";

function makeTask(overrides: Partial<SalesTask>): SalesTask {
  return {
    id: overrides.id ?? "t1",
    leadId: "lead1",
    title: overrides.title ?? "Task",
    description: null,
    taskType: overrides.taskType ?? null,
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "normal",
    dueAt: overrides.dueAt ?? null,
    assignedToUserId: null,
    assignedToName: null,
    completedAt: null,
    completedByUserId: null,
    completedByName: null,
    createdByUserId: null,
    createdByName: null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("sales operation tasks (Phase 4)", () => {
  it("normalizes task enums with safe fallbacks", () => {
    assert.equal(normalizeTaskStatus("done"), "done");
    assert.equal(normalizeTaskStatus("garbage"), "open");
    assert.equal(normalizeTaskType("call"), "call");
    assert.equal(normalizeTaskType("garbage"), null);
    assert.equal(normalizeTaskPriority("high"), "high");
    assert.equal(normalizeTaskPriority(undefined), "normal");
  });

  it("buckets tasks by due date relative to now", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    assert.equal(taskDueBucket(makeTask({ dueAt: "2026-07-10T09:00:00.000Z" }), now), "overdue");
    assert.equal(taskDueBucket(makeTask({ dueAt: "2026-07-17T18:00:00.000Z" }), now), "today");
    assert.equal(taskDueBucket(makeTask({ dueAt: "2026-07-25T09:00:00.000Z" }), now), "upcoming");
    assert.equal(taskDueBucket(makeTask({ dueAt: null }), now), "no_due");
    assert.equal(taskDueBucket(makeTask({ status: "done", dueAt: "2026-07-10T09:00:00.000Z" }), now), "done");
  });

  it("sorts open tasks before done, then by due date, then priority", () => {
    const tasks = [
      makeTask({ id: "done", status: "done", dueAt: "2026-07-01T00:00:00.000Z" }),
      makeTask({ id: "later", dueAt: "2026-07-20T00:00:00.000Z" }),
      makeTask({ id: "sooner", dueAt: "2026-07-10T00:00:00.000Z" }),
      makeTask({ id: "nodue-high", dueAt: null, priority: "high" }),
    ];
    const order = sortTasks(tasks).map((task) => task.id);
    assert.deepEqual(order, ["sooner", "later", "nodue-high", "done"]);
  });

  it("migration files create tasks and activities tables and are registered", () => {
    const tasksSql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_tasks.sql"),
      "utf8",
    );
    assert.match(tasksSql, /create table if not exists public\.sales_tasks/);
    assert.match(tasksSql, /status text not null default 'open'/);

    const activitiesSql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_activities.sql"),
      "utf8",
    );
    assert.match(activitiesSql, /create table if not exists public\.sales_activities/);

    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_tasks\.sql/);
    assert.match(applyScript, /supabase_sales_activities\.sql/);
  });

  it("ships task/activity translations for both locales", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as {
        salesOperation?: {
          task?: Record<string, unknown>;
          tasks?: Record<string, unknown>;
          activity?: Record<string, unknown>;
        };
      };
      assert.ok(messages.salesOperation?.task, `${locale}: missing salesOperation.task`);
      assert.ok(messages.salesOperation?.tasks, `${locale}: missing salesOperation.tasks`);
      assert.ok(messages.salesOperation?.activity, `${locale}: missing salesOperation.activity`);
    }
  });
});
