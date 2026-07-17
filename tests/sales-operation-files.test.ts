import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("sales operation files (Phase 5)", () => {
  it("migration provisions a private bucket and metadata table", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_files.sql"),
      "utf8",
    );
    assert.match(sql, /insert into storage\.buckets/);
    assert.match(sql, /'sales-attachments'/);
    assert.match(sql, /create table if not exists public\.sales_files/);
    assert.match(sql, /references public\.sales_leads \(id\) on delete cascade/);
  });

  it("registers the files migration in the apply script", () => {
    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_files\.sql/);
  });

  it("ships file + detail tab + quick action translations for both locales", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as {
        salesOperation?: {
          file?: Record<string, unknown>;
          detailTab?: Record<string, unknown>;
          quick?: Record<string, unknown>;
        };
      };
      const so = messages.salesOperation;
      assert.ok(so?.file, `${locale}: missing salesOperation.file`);
      assert.ok(so?.detailTab, `${locale}: missing salesOperation.detailTab`);
      assert.ok(so?.quick, `${locale}: missing salesOperation.quick`);
      for (const tab of ["overview", "contacts", "activity", "tasks", "files"]) {
        assert.ok(
          tab in (so.detailTab as Record<string, unknown>),
          `${locale}: missing detailTab.${tab}`,
        );
      }
    }
  });
});
