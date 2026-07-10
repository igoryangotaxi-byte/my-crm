import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAccountManagerUserOptions,
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

describe("crm manager user options", () => {
  it("filters internal CRM users only", () => {
    assert.equal(isInternalCrmUser(internalAccountManager), true);
    assert.equal(isInternalCrmUser(clientPortalUser), false);
  });

  it("returns role-specific manager options", () => {
    const users = [internalAccountManager, internalSalesManager, clientPortalUser];
    assert.deepEqual(getAccountManagerUserOptions(users).map((user) => user.id), ["u1"]);
    assert.deepEqual(getSalesManagerUserOptions(users).map((user) => user.id), ["u2"]);
  });
});
