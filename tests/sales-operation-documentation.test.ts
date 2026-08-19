import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  gridToTableNode,
  normalizeGrid,
  parseCsvToGrid,
} from "@/lib/sales-operation/documentation-import";
import { CURRENT_PERMISSIONS_VERSION, SALES_OPERATION_PAGE_KEYS } from "@/lib/role-permissions";
import { defaultRolePermissions } from "@/types/auth";

describe("sales operation documentation", () => {
  it("registers documentation SQL in the schema applier", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_documentation.sql"),
      "utf8",
    );
    assert.match(sql, /create table if not exists public\.documentation_documents/);
    assert.match(sql, /content jsonb/);
    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_documentation\.sql/);
  });

  it("exposes salesDocumentation page key and defaults", () => {
    assert.ok((SALES_OPERATION_PAGE_KEYS as readonly string[]).includes("salesDocumentation"));
    assert.equal(CURRENT_PERMISSIONS_VERSION, 15);
    assert.equal(defaultRolePermissions.Admin.salesDocumentation, true);
    assert.equal(defaultRolePermissions["Account Manager"].salesDocumentation, true);
    assert.equal(defaultRolePermissions["Sales Manager"].salesDocumentation, true);
    assert.equal(defaultRolePermissions.User.salesDocumentation, false);
    assert.equal(defaultRolePermissions["Team Lead"].salesDocumentation, false);
  });

  it("turns a CSV with a header row into a TipTap table", () => {
    const grid = parseCsvToGrid("Name,Phone\nAcme,\"+972 50-000\"\n");
    assert.deepEqual(grid, [
      ["Name", "Phone"],
      ["Acme", "+972 50-000"],
    ]);
    const table = gridToTableNode(grid);
    assert.equal(table.type, "table");
    const rows = table.content ?? [];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.content?.[0]?.type, "tableHeader");
    assert.equal(rows[1]?.content?.[1]?.type, "tableCell");
    const phone = rows[1]?.content?.[1]?.content?.[0]?.content?.[0];
    assert.equal(phone && "text" in phone ? phone.text : "", "+972 50-000");
  });

  it("pads ragged rows and drops empty ones", () => {
    const grid = normalizeGrid([["A", "B", "C"], ["only"], ["", "", ""], ["x", "y"]]);
    assert.deepEqual(grid, [
      ["A", "B", "C"],
      ["only", "", ""],
      ["x", "y", ""],
    ]);
  });

  it("keeps extra CSV columns and empty cells", () => {
    const grid = parseCsvToGrid("A,B,C\n1,,3,bonus\n");
    assert.deepEqual(grid, [
      ["A", "B", "C", ""],
      ["1", "", "3", "bonus"],
    ]);
  });

  it("uses a header plus an empty body row when the file is a single line", () => {
    const table = gridToTableNode([["Col A", "Col B"]]);
    const rows = table.content ?? [];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.content?.[0]?.type, "tableHeader");
    assert.equal(rows[1]?.content?.[0]?.type, "tableCell");
  });
});
