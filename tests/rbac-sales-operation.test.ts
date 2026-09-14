import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_PERMISSIONS_VERSION,
  mergeRolePermissions,
  resolvePostLoginPath,
  SALES_OPERATION_PAGE_KEYS,
} from "@/lib/role-permissions";
import { resolvePostLoginPathForUser } from "@/lib/sso/post-login-path";
import { defaultRolePermissions, type AuthStoreData } from "@/types/auth";

describe("sales operation RBAC", () => {
  it("defaults sales operation off for User and Team Lead", () => {
    for (const role of ["User", "Team Lead"] as const) {
      const permissions = defaultRolePermissions[role];
      for (const key of SALES_OPERATION_PAGE_KEYS) {
        // preOrders is also a primary CRM page (on for User / Team Lead).
        if (key === "preOrders") continue;
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
    assert.equal(merged.salesDocumentation, true);
    assert.equal(CURRENT_PERMISSIONS_VERSION, 16);
  });

  it("does not land User role on SO pipeline (prevents login flicker loop)", () => {
    const canAccess = (page: string) =>
      Boolean(defaultRolePermissions.User[page as keyof (typeof defaultRolePermissions)["User"]]);
    const path = resolvePostLoginPath({ accountType: "internal", canAccess });
    assert.ok(path);
    assert.equal(path?.startsWith("/sales-operation"), false);
    assert.equal(path, "/dashboard");
  });

  it("lands Account Manager on an SO page", () => {
    const canAccess = (page: string) =>
      Boolean(
        defaultRolePermissions["Account Manager"][
          page as keyof (typeof defaultRolePermissions)["Account Manager"]
        ],
      );
    const path = resolvePostLoginPath({ accountType: "internal", canAccess });
    assert.equal(path, "/sales-operation/pipeline");
  });

  it("resolvePostLoginPathForUser matches role defaults for User", () => {
    const store = {
      users: [],
      rolePermissions: defaultRolePermissions,
      roleAreaAccess: {} as AuthStoreData["roleAreaAccess"],
      roleDashboardBlockAccess: {} as AuthStoreData["roleDashboardBlockAccess"],
      storeMeta: { permissionsVersion: CURRENT_PERMISSIONS_VERSION },
    } as AuthStoreData;
    const path = resolvePostLoginPathForUser(store, {
      role: "User",
      accountType: "internal",
      status: "approved",
    });
    assert.equal(path, "/dashboard");
  });
});
