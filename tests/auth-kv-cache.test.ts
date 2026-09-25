import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_KV_SNAPSHOT_TTL_MS,
  fetchAuthKvSnapshotCached,
  loadPermissionKvSnapshot,
  resetAuthKvSnapshotCacheForTests,
} from "@/lib/auth-kv-cache";
import {
  resetAuthKvRequestContextForTests,
  runWithAuthKvRequestContextAsync,
} from "@/lib/auth-kv-request-context";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";
import type { AuthStoreData } from "@/types/auth";

function minimalStore(label: string): AuthStoreData {
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
    storeMeta: { permissionsVersion: 18 },
    ...( { __label: label } as unknown as Record<string, string> ),
  };
}

describe("auth KV snapshot cache", () => {
  it("reuses cached KV fetch within TTL", async () => {
    resetAuthKvSnapshotCacheForTests();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return minimalStore("a");
    };
    await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
    await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
    assert.equal(loads, 1);
  });

  it("fetchAuthKvSnapshotCached does not cache failed KV reads", async () => {
    resetAuthKvSnapshotCacheForTests();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      throw new Error("KV down");
    };
    await assert.rejects(() => fetchAuthKvSnapshotCached(loader));
    await assert.rejects(() => fetchAuthKvSnapshotCached(loader));
    assert.equal(loads, 2);
  });

  it("reloads after TTL expires", async () => {
    resetAuthKvSnapshotCacheForTests();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return minimalStore(`load-${loads}`);
    };
    const originalNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;
    try {
      await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
      fakeNow = AUTH_KV_SNAPSHOT_TTL_MS + 1;
      await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
      assert.equal(loads, 2);
    } finally {
      Date.now = originalNow;
      resetAuthKvSnapshotCacheForTests();
    }
  });

  it("with AUTH_STORE_MAX_STALE_MS=0 fails on KV error after cache miss (default)", async () => {
    resetAuthKvSnapshotCacheForTests();
    const prev = process.env.AUTH_STORE_MAX_STALE_MS;
    delete process.env.AUTH_STORE_MAX_STALE_MS;
    let loads = 0;
    const loader = async () => {
      loads += 1;
      if (loads === 1) return minimalStore("good");
      throw new Error("KV quota exceeded");
    };
    const originalNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;
    try {
      await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
      fakeNow = AUTH_KV_SNAPSHOT_TTL_MS + 1;
      await assert.rejects(
        () => loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData),
        PermissionStoreUnavailableError,
      );
    } finally {
      Date.now = originalNow;
      resetAuthKvSnapshotCacheForTests();
      if (prev === undefined) delete process.env.AUTH_STORE_MAX_STALE_MS;
      else process.env.AUTH_STORE_MAX_STALE_MS = prev;
    }
  });

  it("serves last-good snapshot within AUTH_STORE_MAX_STALE_MS then throws", async () => {
    resetAuthKvSnapshotCacheForTests();
    const maxStaleMs = 10 * 60 * 1000;
    const prev = process.env.AUTH_STORE_MAX_STALE_MS;
    process.env.AUTH_STORE_MAX_STALE_MS = String(maxStaleMs);
    let loads = 0;
    const loader = async () => {
      loads += 1;
      if (loads === 1) {
        return minimalStore("good");
      }
      throw new Error("KV quota exceeded");
    };
    const originalNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;
    try {
      const first = await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
      assert.equal((first as AuthStoreData & { __label?: string }).__label, "good");
      fakeNow = maxStaleMs - 1;
      const stale = await loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData);
      assert.equal((stale as AuthStoreData & { __label?: string }).__label, "good");
      fakeNow = maxStaleMs + 1;
      await assert.rejects(
        () => loadPermissionKvSnapshot(loader, (raw) => raw as AuthStoreData),
        PermissionStoreUnavailableError,
      );
    } finally {
      Date.now = originalNow;
      resetAuthKvSnapshotCacheForTests();
      if (prev === undefined) delete process.env.AUTH_STORE_MAX_STALE_MS;
      else process.env.AUTH_STORE_MAX_STALE_MS = prev;
    }
  });

  it("marks KV read succeeded in request context on cache hit", async () => {
    resetAuthKvSnapshotCacheForTests();
    await runWithAuthKvRequestContextAsync(async () => {
      resetAuthKvRequestContextForTests();
      await fetchAuthKvSnapshotCached(async () => minimalStore("x"));
      const { getAuthKvReadSucceededInRequest } = await import("@/lib/auth-kv-request-context");
      assert.equal(getAuthKvReadSucceededInRequest(), true);
    });
  });
});
