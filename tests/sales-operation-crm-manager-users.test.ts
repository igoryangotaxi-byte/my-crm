import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAccountManagerUserOptions,
  getAssignableManagerUserOptions,
  getPlatformStaffUserOptions,
  getSalesManagerUserOptions,
  isInternalCrmUser,
} from "@/lib/sales-operation/crm-manager-users";
import type { AuthUser } from "@/types/auth";

const internalAccountManager: AuthUser = {
  id: "u1",
  name: "Anna",
  email: "anna@example.com",
  password: "",
  role: "Account Manager",
  status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z",
  accountType: "internal",
};

const internalSalesManager: AuthUser = {
  id: "u2",
  name: "Sam",
  email: "sam@example.com",
  password: "",
  role: "Sales Manager",
  status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z",
  accountType: "internal",
};

const clientPortalUser: AuthUser = {
  id: "u3",
  name: "Client User",
  email: "client@example.com",
  password: "",
  role: "User",
  status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z",
  accountType: "client",
};

const pendingUser: AuthUser = {
  id: "u4",
  name: "Pending",
  email: "pending@example.com",
  password: "",
  role: "User",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  accountType: "internal",
};

const approvedUser: AuthUser = {
  id: "u5",
  name: "User Five",
  email: "user5@example.com",
  password: "",
  role: "User",
  status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z",
  accountType: "internal",
};

describe("crm manager user options", () => {
  it("filters internal CRM users only", () => {
    assert.equal(isInternalCrmUser(internalAccountManager), true);
    assert.equal(isInternalCrmUser(clientPortalUser), false);
    assert.equal(isInternalCrmUser(pendingUser), false);
  });

  it("returns all platform staff for assignee/filter pickers", () => {
    const users = [
      internalAccountManager,
      internalSalesManager,
      clientPortalUser,
      pendingUser,
      approvedUser,
    ];
    assert.deepEqual(
      getPlatformStaffUserOptions(users).map((user) => user.id).sort(),
      ["u1", "u2", "u5"],
    );
  });

  it("returns assignable managers for automation", () => {
    const users = [internalAccountManager, internalSalesManager, clientPortalUser, approvedUser];
    assert.deepEqual(
      getAssignableManagerUserOptions(users).map((user) => user.id).sort(),
      ["u1", "u2"],
    );
  });

  it("returns account and sales manager options", () => {
    const users = [internalAccountManager, internalSalesManager, approvedUser];
    assert.deepEqual(getAccountManagerUserOptions(users).map((u) => u.id), ["u1"]);
    assert.deepEqual(getSalesManagerUserOptions(users).map((u) => u.id), ["u2"]);
  });
});
