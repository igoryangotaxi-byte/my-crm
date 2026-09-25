import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isForbiddenStaffReturnPath,
  resolveAuthenticatedLandingPath,
} from "@/lib/login-redirect";
import { STAFF_MY_SPACE_PATH } from "@/lib/role-permissions";
import { defaultRolePermissions } from "@/types/auth";

describe("resolveAuthenticatedLandingPath", () => {
  it("falls back to My Space when return URL is invalid", () => {
    const canAccess = (page: string) =>
      Boolean(defaultRolePermissions.User[page as keyof typeof defaultRolePermissions.User]);
    assert.equal(
      resolveAuthenticatedLandingPath({
        accountType: "internal",
        canAccess,
        returnPath: "https://evil.test",
      }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("lands on forbidden deep link URL for layout no-access (not My Space)", () => {
    const canAccess = (page: string) =>
      Boolean(defaultRolePermissions.User[page as keyof typeof defaultRolePermissions.User]);
    assert.equal(
      resolveAuthenticatedLandingPath({
        accountType: "internal",
        canAccess,
        returnPath: "/sales-operation/pipeline",
      }),
      "/sales-operation/pipeline",
    );
    assert.equal(
      isForbiddenStaffReturnPath({
        accountType: "internal",
        canAccess,
        returnPath: "/sales-operation/pipeline",
      }),
      true,
    );
  });

  it("allows return path when RBAC permits it", () => {
    const canAccess = (page: string) =>
      Boolean(
        defaultRolePermissions["Account Manager"][
          page as keyof (typeof defaultRolePermissions)["Account Manager"]
        ],
      );
    assert.equal(
      resolveAuthenticatedLandingPath({
        accountType: "internal",
        canAccess,
        returnPath: "/sales-operation/pipeline",
      }),
      "/sales-operation/pipeline",
    );
    assert.equal(
      isForbiddenStaffReturnPath({
        accountType: "internal",
        canAccess,
        returnPath: "/sales-operation/pipeline",
      }),
      false,
    );
  });
});
