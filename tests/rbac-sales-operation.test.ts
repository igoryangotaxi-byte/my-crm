import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_PERMISSIONS_VERSION,
  mergeRolePermissions,
  resolvePostLoginPath,
  STAFF_MY_SPACE_PATH,
  SALES_OPERATION_PAGE_KEYS,
} from "@/lib/role-permissions";
import { resolvePostLoginPathForUser } from "@/lib/sso/post-login-path";
import { defaultRolePermissions, type AuthStoreData } from "@/types/auth";

describe("sales operation RBAC", () => {
  it("defaults User and Team Lead to SO shell + My Space only (not full pipeline)", () => {
    for (const role of ["User", "Team Lead"] as const) {
      const permissions = defaultRolePermissions[role];
      assert.equal(permissions.salesOperation, true, `${role} SO shell`);
      assert.equal(permissions.salesMySpace, true, `${role} My Space`);
      assert.equal(permissions.salesPipeline, false, `${role} pipeline off`);
      for (const key of SALES_OPERATION_PAGE_KEYS) {
        if (key === "salesOperation" || key === "salesMySpace" || key === "preOrders") continue;
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
    assert.equal(merged.salesSettings, false);
    assert.equal(merged.salesDocumentation, true);
    assert.equal(CURRENT_PERMISSIONS_VERSION, 19);
  });

  it("migrates v18 User to SO + My Space when store had legacy defaults", () => {
    const merged = mergeRolePermissions("User", {}, 18);
    assert.equal(merged.salesOperation, true);
    assert.equal(merged.salesMySpace, true);
    assert.equal(merged.salesPipeline, false);
  });

  it("lands internal staff on My Space by default", () => {
    const canAccessUser = (page: string) =>
      Boolean(defaultRolePermissions.User[page as keyof (typeof defaultRolePermissions)["User"]]);
    assert.equal(
      resolvePostLoginPath({ accountType: "internal", canAccess: canAccessUser }),
      STAFF_MY_SPACE_PATH,
    );

    const canAccessAm = (page: string) =>
      Boolean(
        defaultRolePermissions["Account Manager"][
          page as keyof (typeof defaultRolePermissions)["Account Manager"]
        ],
      );
    assert.equal(
      resolvePostLoginPath({ accountType: "internal", canAccess: canAccessAm }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("resolvePostLoginPathForUser matches My Space for User", () => {
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
    assert.equal(path, STAFF_MY_SPACE_PATH);
  });
});
