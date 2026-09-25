import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOwnDataOnlyStaffRole,
  resolveSalesTasksListScope,
} from "@/lib/sales-operation/my-space-data-scope";

describe("my-space data scope", () => {
  it("forces User and Team Lead to mine scope even when all is requested", () => {
    assert.equal(resolveSalesTasksListScope("User", "all"), "mine");
    assert.equal(resolveSalesTasksListScope("Team Lead", "all"), "mine");
    assert.equal(isOwnDataOnlyStaffRole("Team Lead"), true);
  });

  it("allows Account Manager to request all tasks", () => {
    assert.equal(resolveSalesTasksListScope("Account Manager", "all"), "all");
  });

  it("preserves created scope for own-data roles", () => {
    assert.equal(resolveSalesTasksListScope("User", "created"), "created");
  });
});
