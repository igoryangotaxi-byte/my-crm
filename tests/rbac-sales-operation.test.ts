import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_PERMISSIONS_VERSION,
  effectivePageAccess,
  mergeRolePermissions,
  resolvePostLoginPath,
  STAFF_MY_SPACE_PATH,
  SALES_OPERATION_PAGE_KEYS,
} from "@/lib/role-permissions";
import { resolvePostLoginPathForUser } from "@/lib/sso/post-login-path";
import { defaultRolePermissions, type AuthStoreData, type RolePermissions } from "@/types/auth";

describe("sales operation RBAC", () => {
  it("code defaults: User and Team Lead get My Space only (SO shell on, other SO off)", () => {
    for (const role of ["User", "Team Lead"] as const) {
      const permissions = defaultRolePermissions[role];
      assert.equal(permissions.salesOperation, true, `${role} SO shell on`);
      assert.equal(permissions.salesMySpace, true, `${role} My Space on`);
      assert.equal(permissions.salesPipeline, false, `${role} pipeline off`);
      assert.equal(permissions.salesDriversPipeline, false, `${role} drivers pipeline off`);
      assert.equal(permissions.salesSettings, false, `${role} settings off`);
      assert.equal(permissions.accesses, false, `${role} accesses off`);
    }
  });

  it("salesMySpace inherits salesOperation when absent in stored KV", () => {
    const withSoOnly = mergeRolePermissions(
      "User",
      { salesOperation: true },
      CURRENT_PERMISSIONS_VERSION,
    );
    assert.equal(withSoOnly.salesOperation, true);
    assert.equal(withSoOnly.salesMySpace, true);
    assert.equal(withSoOnly.salesPipeline, false);
    assert.equal(withSoOnly.salesDriversPipeline, false);

    const forcedOff = mergeRolePermissions(
      "User",
      { salesOperation: false },
      CURRENT_PERMISSIONS_VERSION,
    );
    assert.equal(forcedOff.salesOperation, false);
    assert.equal(forcedOff.salesMySpace, false);

    const fromDefaults = mergeRolePermissions("User", {}, CURRENT_PERMISSIONS_VERSION);
    assert.equal(fromDefaults.salesOperation, true);
    assert.equal(fromDefaults.salesMySpace, true);
    assert.equal(fromDefaults.salesPipeline, false);
    assert.equal(fromDefaults.salesDriversPipeline, false);
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
    assert.equal(merged.salesDriversPipeline, true);
    assert.equal(CURRENT_PERMISSIONS_VERSION, 19);
  });

  it("lands internal staff on My Space when SO + My Space are granted in store", () => {
    const canAccessUser = (page: string) => {
      const merged = mergeRolePermissions(
        "User",
        { salesOperation: true, salesMySpace: true },
        CURRENT_PERMISSIONS_VERSION,
      );
      return Boolean(merged[page as keyof typeof merged]);
    };
    assert.equal(
      resolvePostLoginPath({ accountType: "internal", canAccess: canAccessUser }),
      STAFF_MY_SPACE_PATH,
    );

    const canAccessAm = (page: string) =>
      Boolean(
        mergeRolePermissions("Account Manager", undefined, CURRENT_PERMISSIONS_VERSION)[
          page as keyof ReturnType<typeof mergeRolePermissions>
        ],
      );
    assert.equal(
      resolvePostLoginPath({ accountType: "internal", canAccess: canAccessAm }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("resolvePostLoginPathForUser uses store role permissions", () => {
    const store = {
      rolePermissions: defaultRolePermissions,
      storeMeta: { permissionsVersion: CURRENT_PERMISSIONS_VERSION },
    } as AuthStoreData;
    const path = resolvePostLoginPathForUser(store, {
      role: "User",
      status: "approved",
      accountType: "internal",
    });
    assert.equal(path, STAFF_MY_SPACE_PATH);
  });
});

describe("effectivePageAccess", () => {
  const rolePermissions = defaultRolePermissions as RolePermissions;

  it("Admin always gets full access regardless of overrides", () => {
    const access = effectivePageAccess(
      {
        role: "Admin",
        pageOverrides: { salesPipeline: false, accesses: false },
      },
      rolePermissions,
    );
    assert.equal(access.salesPipeline, true);
    assert.equal(access.accesses, true);
    assert.equal(access.salesSettings, true);
  });

  it("User defaults to My Space only", () => {
    const access = effectivePageAccess({ role: "User" }, rolePermissions);
    assert.equal(access.salesOperation, true);
    assert.equal(access.salesMySpace, true);
    assert.equal(access.salesPipeline, false);
    assert.equal(access.salesSettings, false);
  });

  it("explicit override true grants a page beyond role default", () => {
    const access = effectivePageAccess(
      { role: "User", pageOverrides: { salesPipeline: true } },
      rolePermissions,
    );
    assert.equal(access.salesPipeline, true);
    assert.equal(access.salesMySpace, true);
  });

  it("explicit override false revokes a page from role default", () => {
    const access = effectivePageAccess(
      { role: "Account Manager", pageOverrides: { salesPipeline: false } },
      rolePermissions,
    );
    assert.equal(access.salesPipeline, false);
    assert.equal(access.salesMySpace, true);
  });
});
