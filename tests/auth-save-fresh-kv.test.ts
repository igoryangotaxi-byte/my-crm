import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";

describe("saveAuthStore strict vs caller-safe (request-rides / SSO path)", () => {
  it("strictFreshKv throws PermissionStoreUnavailableError when KV is unavailable", async () => {
    const prevUrl = process.env.KV_REST_API_URL;
    const prevToken = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const { saveAuthStore, loadAuthStore } = await import("@/lib/auth-store");
    const store = await loadAuthStore();

    try {
      await assert.rejects(
        () => saveAuthStore(store, { strictFreshKv: true }),
        PermissionStoreUnavailableError,
      );
    } finally {
      if (prevUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = prevUrl;
      if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = prevToken;
    }
  });

  it("default saveAuthStore resolves when KV is unavailable (matches main resilience for callers)", async () => {
    const prevUrl = process.env.KV_REST_API_URL;
    const prevToken = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const { saveAuthStore, loadAuthStore } = await import("@/lib/auth-store");
    const store = await loadAuthStore();

    try {
      await saveAuthStore(store);
    } finally {
      if (prevUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = prevUrl;
      if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = prevToken;
    }
  });
});

describe("POST /api/auth uses strictFreshKv on persist", () => {
  it("route passes strictFreshKv to saveAuthStore", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/auth/route.ts", "utf8");
    assert.match(src, /saveAuthStore\(nextStore,\s*\{\s*strictFreshKv:\s*true\s*\}/);
  });
});
