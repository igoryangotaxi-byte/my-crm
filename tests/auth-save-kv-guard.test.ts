import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertFreshKvReadableForStrictSave,
  readAuthKvSnapshotFreshForSave,
} from "@/lib/auth-kv-save-guard.server";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";
import type { AuthStoreData } from "@/types/auth";

function minimalStore(): AuthStoreData {
  return {
    users: [],
    rolePermissions: {} as AuthStoreData["rolePermissions"],
    roleAreaAccess: {} as AuthStoreData["roleAreaAccess"],
    roleDashboardBlockAccess: {} as AuthStoreData["roleDashboardBlockAccess"],
    tenantAccounts: [],
    tenantRoles: {},
    globalB2CSettings: {
      enabled: false,
      token: null,
      clientId: null,
      rideClass: "comfortplus",
      createEndpoint: null,
    },
    storeMeta: { permissionsVersion: 19 },
  };
}

describe("fresh KV read for save", () => {
  it("returns not ok when KV env is missing", async () => {
    const prevUrl = process.env.KV_REST_API_URL;
    const prevToken = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    try {
      const result = await readAuthKvSnapshotFreshForSave();
      assert.equal(result.ok, false);
    } finally {
      if (prevUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = prevUrl;
      if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = prevToken;
    }
  });

  it("strict save guard throws before any Auth mutation path", () => {
    assert.throws(
      () => assertFreshKvReadableForStrictSave({ ok: false, reason: "kv_read_failed" }),
      PermissionStoreUnavailableError,
    );
  });

  it("saveAuthUsersToSupabaseAuthFallback strict throws when fresh KV unavailable", async () => {
    const prevUrl = process.env.KV_REST_API_URL;
    const prevToken = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    try {
      const { saveAuthUsersToSupabaseAuthFallback } = await import("@/lib/supabase-auth-store");
      await assert.rejects(
        () => saveAuthUsersToSupabaseAuthFallback(minimalStore(), { strictFreshKv: true }),
        PermissionStoreUnavailableError,
      );
    } finally {
      if (prevUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = prevUrl;
      if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = prevToken;
    }
  });
});
