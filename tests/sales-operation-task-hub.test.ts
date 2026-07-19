import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("sales operation task hub schema", () => {
  it("adds result_summary, parent_task_id, and sales_task_events", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_task_hub.sql"),
      "utf8",
    );
    assert.match(sql, /result_summary/);
    assert.match(sql, /parent_task_id/);
    assert.match(sql, /create table if not exists[\s\S]*sales_task_events/);
    assert.match(sql, /sales_tasks_created_by_idx/);
  });

  it("registers task hub + stage gate migrations in apply script", () => {
    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_task_hub\.sql/);
    assert.match(applyScript, /supabase_sales_stage_gates\.sql/);
  });

  it("stage gates SQL adds pricing and contract fields on leads", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_stage_gates.sql"),
      "utf8",
    );
    assert.match(sql, /pricing_proposal/);
    assert.match(sql, /pricing_amount/);
    assert.match(sql, /contract_number/);
    assert.match(sql, /corp_client_id/);
  });
});
