import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDestinationForThreeCx } from "@/lib/call-center/phone";
import { buildTokenRequestBody } from "@/lib/call-center/token";
import {
  buildMakeCallBody,
  buildMakeCallPath,
  readParticipant,
} from "@/lib/call-center/client";
import { isCallCenterOperatorStatus } from "@/lib/call-center/repository";

describe("call-center phone normalize", () => {
  it("normalizes Israeli mobiles to 972… digits", () => {
    assert.equal(normalizeDestinationForThreeCx("+972 52-123-4567"), "972521234567");
    assert.equal(normalizeDestinationForThreeCx("0521234567"), "972521234567");
    assert.equal(normalizeDestinationForThreeCx("521234567"), "972521234567");
  });

  it("rejects empty / invalid", () => {
    assert.equal(normalizeDestinationForThreeCx(""), null);
    assert.equal(normalizeDestinationForThreeCx("abc"), null);
    assert.equal(normalizeDestinationForThreeCx(null), null);
  });
});

describe("call-center request shaping", () => {
  it("builds client_credentials token body", () => {
    const body = buildTokenRequestBody({
      baseUrl: "https://pbx.example.com",
      clientId: "app-id",
      clientSecret: "secret",
    });
    assert.equal(body.get("grant_type"), "client_credentials");
    assert.equal(body.get("client_id"), "app-id");
    assert.equal(body.get("client_secret"), "secret");
  });

  it("builds makecall path with and without device", () => {
    assert.equal(buildMakeCallPath("101"), "/callcontrol/101/makecall");
    assert.equal(
      buildMakeCallPath("101", "sip:webclient"),
      "/callcontrol/101/devices/sip%3Awebclient/makecall",
    );
  });

  it("builds makecall JSON body", () => {
    assert.deepEqual(buildMakeCallBody("972521234567", 45), {
      destination: "972521234567",
      timeout: 45,
    });
  });

  it("parses participant payload", () => {
    const p = readParticipant({
      id: 12,
      status: "Ringing",
      party_caller_name: "Driver",
      party_caller_id: "972521234567",
      direct_control: true,
      callid: 99,
    });
    assert.ok(p);
    assert.equal(p!.id, 12);
    assert.equal(p!.status, "Ringing");
    assert.equal(p!.partyCallerId, "972521234567");
    assert.equal(p!.directControl, true);
  });

  it("validates operator status", () => {
    assert.equal(isCallCenterOperatorStatus("available"), true);
    assert.equal(isCallCenterOperatorStatus("busy"), false);
  });
});
