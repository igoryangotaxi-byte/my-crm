import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-errors";
import {
  __setPermissionStoreLoaderForTests,
  guardOpsApiPagePermission,
} from "@/lib/ops-api-page-permission";
import type { AuthUser } from "@/types/auth";

const testUser: AuthUser = {
  id: "user-test-1",
  name: "Test",
  email: "test@appli.taxi",
  password: "",
  role: "User",
  status: "approved",
  createdAt: new Date().toISOString(),
  accountType: "internal",
};

describe("request-rides-create permission guard integration", () => {
  afterEach(() => {
    __setPermissionStoreLoaderForTests(null);
  });

  it("503 PERMISSION_STORE_UNAVAILABLE is returned before route side effects", async () => {
    __setPermissionStoreLoaderForTests(async () => {
      throw new PermissionStoreUnavailableError();
    });

    const response = await guardOpsApiPagePermission(
      testUser,
      new Request("http://localhost/api/request-rides-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: "T",
          clientId: "c",
          sourceAddress: "A",
          destinationAddress: "B",
          phoneNumber: "+972501234567",
        }),
      }),
      "requestRides",
    );

    assert.ok(response);
    assert.equal(response!.status, 503);
    const body = await response!.json();
    assert.equal(body.error.code, "PERMISSION_STORE_UNAVAILABLE");
    assert.equal(body.error.nothingSent, true);
  });

  it("request-rides-create route has no Yango or address-store writes before guard", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/request-rides-create/route.ts"),
      "utf8",
    );
    const postIdx = src.indexOf("export async function POST");
    assert.ok(postIdx > 0);
    const postBody = src.slice(postIdx);
    const guardIdx = postBody.indexOf("guardOpsApiPagePermission");
    const deniedReturnIdx = postBody.indexOf("if (denied) return denied");
    const yangoIdx = postBody.indexOf("createRequestRide");
    const snapshotIdx = postBody.indexOf("saveRequestRideAddressSnapshot");
    assert.ok(guardIdx > 0);
    assert.ok(deniedReturnIdx > guardIdx);
    assert.ok(yangoIdx > deniedReturnIdx);
    assert.ok(snapshotIdx > yangoIdx);
    assert.equal(postBody.indexOf("/api/sms/send"), -1, "create route must not send SMS");
  });

  it("request-rides UI skips SMS when PERMISSION_STORE_UNAVAILABLE is classified", () => {
    const src = readFileSync(
      join(process.cwd(), "app/(crm)/request-rides/page.tsx"),
      "utf8",
    );
    const classifyIdx = src.indexOf("classifyOpsApiResponse(response.status, data)");
    assert.ok(classifyIdx > 0);
    const slice = src.slice(classifyIdx, classifyIdx + 800);
    assert.match(slice, /store_unavailable/);
    assert.match(slice, /setOpsOutcome\(outcomeKind\)/);
    assert.match(slice, /return;/);
    const returnIdx = slice.indexOf("return;");
    const sendSmsIdx = slice.indexOf("sendSms");
    assert.equal(sendSmsIdx, -1, "early return must precede any sendSms in this handler block");
  });
});
