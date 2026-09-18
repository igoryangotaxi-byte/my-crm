import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  formatCallAtJerusalem,
  israelPhoneKey,
  israelPhonesMatch,
  normalizeDestinationForThreeCx,
} from "@/lib/call-center/phone";
import { buildTokenRequestBody } from "@/lib/call-center/token";
import {
  buildMakeCallBody,
  buildMakeCallPath,
  readParticipant,
} from "@/lib/call-center/client";
import { isCallCenterOperatorStatus } from "@/lib/call-center/repository";
import { parseCallAt } from "@/lib/call-center/calls-repository";
import {
  assertThreeCxWebhookAuthorized,
  contactUrlForClient,
  contactUrlForLead,
  parseBarOzRequestBody,
  readBarOzString,
  readThreeCxWebhookKey,
  toCreateContactResponse,
  type BarOzLookupContact,
} from "@/lib/call-center/baroz-crm";

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

  it("matches Israel mobiles and landlines across formats", () => {
    assert.equal(israelPhoneKey("054-123-4567"), "541234567");
    assert.equal(israelPhoneKey("+972541234567"), "541234567");
    assert.equal(israelPhoneKey("972541234567"), "541234567");
    assert.equal(israelPhoneKey("00972541234567"), "541234567");
    assert.ok(israelPhonesMatch("0541234567", "+972 54-123-4567"));
    assert.ok(israelPhonesMatch("037778504", "+972-3-7778504"));
    assert.equal(israelPhoneKey("037778504"), "37778504");
    assert.equal(israelPhoneKey("97237778504"), "37778504");
    assert.equal(israelPhonesMatch("0541234567", "0521234567"), false);
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

describe("Bar Oz webhook auth", () => {
  const original = process.env.THREECX_CRM_WEBHOOK_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.THREECX_CRM_WEBHOOK_SECRET;
    else process.env.THREECX_CRM_WEBHOOK_SECRET = original;
  });

  it("fail-closes when secret is missing", async () => {
    delete process.env.THREECX_CRM_WEBHOOK_SECRET;
    const res = assertThreeCxWebhookAuthorized(
      new Request("https://applitaxi.space/api/integrations/3cx/lookup-by-phone?key=x"),
    );
    assert.ok(res);
    assert.equal(res.status, 503);
  });

  it("accepts ?key= and documented headers", () => {
    process.env.THREECX_CRM_WEBHOOK_SECRET = "crm-secret";
    assert.equal(
      readThreeCxWebhookKey(
        new Request("https://applitaxi.space/api/integrations/3cx/lookup-by-phone?key=crm-secret"),
      ),
      "crm-secret",
    );
    assert.equal(
      readThreeCxWebhookKey(
        new Request("https://applitaxi.space/api/integrations/3cx/lookup-by-phone", {
          headers: { "X-3CX-Webhook-Key": "crm-secret" },
        }),
      ),
      "crm-secret",
    );
    assert.equal(
      readThreeCxWebhookKey(
        new Request("https://applitaxi.space/api/integrations/3cx/lookup-by-phone", {
          headers: { Authorization: "Bearer crm-secret" },
        }),
      ),
      "crm-secret",
    );
    const ok = assertThreeCxWebhookAuthorized(
      new Request("https://applitaxi.space/api/integrations/3cx/lookup-by-phone?key=crm-secret"),
    );
    assert.equal(ok, null);
    const denied = assertThreeCxWebhookAuthorized(
      new Request("https://applitaxi.space/api/integrations/3cx/lookup-by-phone?key=wrong"),
    );
    assert.ok(denied);
    assert.equal(denied.status, 401);
  });
});

describe("Bar Oz body + create response", () => {
  it("reads Recording URL with a space and form bodies", async () => {
    const jsonReq = new Request("https://applitaxi.space/api/integrations/3cx/call-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Phone: "0541234567", "Recording URL": "https://pbx.example/rec.wav" }),
    });
    const jsonBody = await parseBarOzRequestBody(jsonReq);
    assert.ok(jsonBody);
    assert.equal(readBarOzString(jsonBody, "Recording URL", "Recording_URL"), "https://pbx.example/rec.wav");

    const formReq = new Request("https://applitaxi.space/api/integrations/3cx/add-contact?Phone=0520000000", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "First_Name=Roy&Last_Name=Dedi&Company=Bar-Oz&Phone=0541234567",
    });
    const formBody = await parseBarOzRequestBody(formReq);
    assert.ok(formBody);
    assert.equal(readBarOzString(formBody, "First_Name"), "Roy");
    assert.equal(readBarOzString(formBody, "Phone"), "0541234567");
    assert.equal(readBarOzString(formBody, "Company"), "Bar-Oz");
  });

  it("returns Bar Oz create-contact field names", () => {
    const lookup: BarOzLookupContact = {
      ID: "abc",
      First_Name: "Roy",
      Last_Name: "Dedi",
      Company_Name: "Bar-Oz Communications",
      Email: "roy@bar-oz.co.il",
      Phone_Business: "037778504",
      Phone_Business2: "",
      Phone_Mobile: "0541234567",
      Phone_Mobile2: "",
      Contact_URL: "https://applitaxi.space/sales-operation/pipeline?lead=abc",
    };
    const created = toCreateContactResponse(lookup);
    assert.deepEqual(Object.keys(created).sort(), [
      "Company_Name",
      "Contact_URL",
      "Email",
      "First_Name",
      "ID",
      "Last_Name",
      "Phone_Mobile",
    ]);
    assert.equal(created.ID, "abc");
    assert.equal(created.Contact_URL, lookup.Contact_URL);
  });

  it("builds Contact_URL for lead and client cards", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://applitaxi.space";
    try {
      assert.equal(
        contactUrlForLead("lead-1"),
        "https://applitaxi.space/sales-operation/pipeline?lead=lead-1",
      );
      assert.equal(
        contactUrlForClient("client-9"),
        "https://applitaxi.space/sales-operation/b2b-clients/client-9",
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });
});

describe("call history timestamps", () => {
  it("parses Bar Oz dotted DateTime as Asia/Jerusalem", () => {
    const iso = parseCallAt("21.7.2020 10:15");
    assert.ok(iso);
    // July is IDT (UTC+3) → 07:15Z
    assert.equal(iso, "2020-07-21T07:15:00.000Z");
  });

  it("keeps explicit Z timestamps", () => {
    assert.equal(parseCallAt("2020-07-21T10:15:00Z"), "2020-07-21T10:15:00.000Z");
  });

  it("formats history in Asia/Jerusalem", () => {
    const label = formatCallAtJerusalem("2020-07-21T07:15:00.000Z");
    assert.match(label, /21/);
    assert.match(label, /07/);
    assert.match(label, /2020/);
    assert.match(label, /10:15/);
  });
});
