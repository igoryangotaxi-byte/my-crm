import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_PERMISSIONS_VERSION,
  mergeRolePermissions,
  SALES_OPERATION_PAGE_KEYS,
} from "@/lib/role-permissions";
import { defaultRolePermissions } from "@/types/auth";

describe("sales operation RBAC", () => {
  it("defaults sales operation off for User and Team Lead", () => {
    for (const role of ["User", "Team Lead"] as const) {
      const permissions = defaultRolePermissions[role];
      for (const key of SALES_OPERATION_PAGE_KEYS) {
        assert.equal(permissions[key], false, `${role} should not access ${key} by default`);
      }
    }
  });

  it("defaults sales operation on for Account Manager and Sales Manager (except Admin-only settings)", () => {
    for (const role of ["Account Manager", "Sales Manager"] as const) {
      const permissions = defaultRolePermissions[role];
      for (const key of SALES_OPERATION_PAGE_KEYS) {
        if (key === "salesSettings") {
          assert.equal(permissions[key], false, `${role} should not access settings by default`);
          continue;
        }
        assert.equal(permissions[key], true, `${role} should access ${key} by default`);
      }
    }
  });

  it("keeps salesSettings Admin-only by default", () => {
    assert.equal(defaultRolePermissions.Admin.salesSettings, true);
    for (const role of ["User", "Team Lead", "Account Manager", "Sales Manager"] as const) {
      assert.equal(defaultRolePermissions[role].salesSettings, false);
    }
  });

  it("migrates v8 permissions by inheriting legacy salesOperation flag", () => {
    const merged = mergeRolePermissions("User", { salesOperation: true }, 8);
    assert.equal(merged.salesOperation, true);
    assert.equal(merged.salesPipeline, true);
    assert.equal(merged.salesManagerAnalytics, true);
    assert.equal(merged.salesAutomation, true);
    // salesSettings stays Admin-only even when inheriting the legacy flag.
    assert.equal(merged.salesSettings, false);
    assert.equal(CURRENT_PERMISSIONS_VERSION, 12);
  });
});
