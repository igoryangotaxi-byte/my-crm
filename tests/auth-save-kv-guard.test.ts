import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardManagedUserDeletionsRequireKvRead } from "@/lib/auth-kv-save-guard";
import { runWithAuthKvRequestContextAsync } from "@/lib/auth-kv-request-context";
import { markAuthKvReadSucceededInRequest } from "@/lib/auth-kv-request-context";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";

describe("guardManagedUserDeletionsRequireKvRead", () => {
  it("throws when KV read did not succeed in this request (zero deletions path)", async () => {
    await runWithAuthKvRequestContextAsync(async () => {
      assert.throws(() => guardManagedUserDeletionsRequireKvRead(), PermissionStoreUnavailableError);
    });
  });

  it("allows deletions when KV read succeeded in this request", async () => {
    await runWithAuthKvRequestContextAsync(async () => {
      markAuthKvReadSucceededInRequest();
      assert.doesNotThrow(() => guardManagedUserDeletionsRequireKvRead());
    });
  });
});
