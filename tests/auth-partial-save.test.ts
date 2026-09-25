import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAuthClientPatch } from "@/lib/auth-client-patch";
import { resolveSessionUserFromStore } from "@/lib/server-auth";
import { buildSessionSetCookie } from "@/lib/server-session";
import {
  defaultRoleAreaAccess,
  defaultRoleDashboardBlockAccess,
  defaultRolePermissions,
  type AuthStoreData,
  type AuthUser,
} from "@/types/auth";

function sampleStore(): AuthStoreData {
  const admin: AuthUser = {
    id: "user-admin-1",
    authUserId: "auth-1",
    name: "Admin",
    email: "admin@appli.taxi",
    password: "",
    role: "Admin",
    status: "approved",
    createdAt: new Date().toISOString(),
    accountType: "internal",
  };
  const operator: AuthUser = {
    id: "user-op-1",
    authUserId: "auth-2",
    name: "Op",
    email: "op@appli.taxi",
    password: "",
    role: "User",
    status: "approved",
    createdAt: new Date().toISOString(),
    accountType: "internal",
  };
  return {
    users: [admin, operator],
    rolePermissions: defaultRolePermissions,
    roleAreaAccess: defaultRoleAreaAccess,
    roleDashboardBlockAccess: defaultRoleDashboardBlockAccess,
    tenantAccounts: [],
    tenantRoles: {},
    globalB2CSettings: {
      enabled: false,
      token: null,
      clientId: null,
      rideClass: "comfortplus",
      createEndpoint: null,
    },
    storeMeta: { permissionsVersion: 18 },
  };
}

describe("auth partial save helpers", () => {
  it("resolveSessionUserFromStore uses the provided snapshot (single load)", () => {
    const store = sampleStore();
    const cookie = buildSessionSetCookie("user-op-1");
    const request = new Request("https://crm.test/api/auth", {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    const user = resolveSessionUserFromStore(request, store);
    assert.equal(user?.id, "user-op-1");
    assert.equal(user?.role, "User");
  });

  it("applyAuthClientPatch merges updated user and role permissions", () => {
    const store = sampleStore();
    const updatedUser = { ...store.users[1], role: "Team Lead" as const };
    const permissions = {
      ...store.rolePermissions.User,
      orders: false,
    };
    const merged = applyAuthClientPatch({
      users: store.users,
      rolePermissions: store.rolePermissions,
      patch: {
        updatedUser,
        updatedRolePermissions: { role: "User", permissions },
      },
    });
    assert.equal(merged.users.find((u) => u.id === "user-op-1")?.role, "Team Lead");
    assert.equal(merged.rolePermissions.User.orders, false);
  });
});

