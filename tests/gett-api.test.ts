import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCompanyUuidFromGettAccessToken,
  pickBusinessCompanyUuid,
  mapGettOrderRow,
  resolveDemandApiBaseUrlFromEnv,
  resolveDemandOAuthClientId,
  resolveDemandPartnerApiBaseUrl,
  resolveGettPartnerId,
} from "../lib/gett-api";

test("resolveGettPartnerId prefers explicit partner id", () => {
  assert.equal(resolveGettPartnerId("a.b", "explicit"), "explicit");
});

test("resolveGettPartnerId derives prefix before first dot", () => {
  assert.equal(
    resolveGettPartnerId("82e1b95a-8690-4c26-b45b-5465af3a1bd7.82873f01-496f-11f1-9c83-62331b97151b", ""),
    "82e1b95a-8690-4c26-b45b-5465af3a1bd7",
  );
});

test("resolveDemandPartnerApiBaseUrl uses api.gett.com when OAuth is Business host", () => {
  assert.equal(
    resolveDemandPartnerApiBaseUrl({
      gettApiBaseUrl: "https://business-api.gett.com",
      usesBusinessOAuth: true,
      explicitDemandUrl: "",
    }),
    "https://api.gett.com",
  );
});

test("resolveDemandPartnerApiBaseUrl respects explicit override", () => {
  assert.equal(
    resolveDemandPartnerApiBaseUrl({
      gettApiBaseUrl: "https://business-api.gett.com",
      usesBusinessOAuth: true,
      explicitDemandUrl: "https://example.test/api/",
    }),
    "https://example.test/api",
  );
});

test("resolveDemandOAuthClientId strips dotted portal bundle by default", () => {
  const keys = ["GETT_DEMAND_OAUTH_CLIENT_ID", "GETT_DEMAND_OAUTH_USE_FULL_CLIENT_ID"] as const;
  const backup = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  try {
    assert.equal(
      resolveDemandOAuthClientId("82e1b95a-8690-4c26-b45b-5465af3a1bd7.82873f01-496f-11f1-9c83-62331b97151b"),
      "82e1b95a-8690-4c26-b45b-5465af3a1bd7",
    );
  } finally {
    for (const k of keys) {
      if (backup[k] !== undefined) process.env[k] = backup[k];
      else delete process.env[k];
    }
  }
});

test("resolveDemandPartnerApiBaseUrl follows GETT_API_BASE_URL for legacy OAuth", () => {
  assert.equal(
    resolveDemandPartnerApiBaseUrl({
      gettApiBaseUrl: "https://api.gett.com",
      usesBusinessOAuth: false,
      explicitDemandUrl: "",
    }),
    "https://api.gett.com",
  );
});

test("extractCompanyUuidFromGettAccessToken reads companyUUID claim", () => {
  const uuid = "82e1b95a-8690-4c26-b45b-5465af3a1bd7";
  const payload = globalThis.Buffer.from(JSON.stringify({ companyUUID: uuid }), "utf8").toString("base64url");
  const token = `x.${payload}.y`;
  assert.equal(extractCompanyUuidFromGettAccessToken(token), uuid);
});

test("extractCompanyUuidFromGettAccessToken finds UUID nested under a company key", () => {
  const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const payload = globalThis.Buffer.from(JSON.stringify({ wrapper: { companyUUID: uuid } }), "utf8").toString("base64url");
  assert.equal(extractCompanyUuidFromGettAccessToken(`h.${payload}.s`), uuid.toLowerCase());
});

test("pickBusinessCompanyUuid prefers bundle suffix when both segments appear in JWT", () => {
  const partner = "82e1b95a-8690-4c26-b45b-5465af3a1bd7";
  const company = "82873f01-496f-11f1-9c83-62331b97151b";
  const payload = globalThis.Buffer.from(
    JSON.stringify({ aud: "api", related: [partner, company] }),
    "utf8",
  ).toString("base64url");
  const token = `h.${payload}.s`;
  const clientId = `${partner}.${company}`;
  assert.equal(pickBusinessCompanyUuid(token, partner, clientId), company);
});

test("pickBusinessCompanyUuid uses Client_ID bundle suffix as company when JWT omits UUID claims", () => {
  const backup = process.env.GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX;
  delete process.env.GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX;
  try {
    const partner = "82e1b95a-8690-4c26-b45b-5465af3a1bd7";
    const company = "82873f01-496f-11f1-9c83-62331b97151b";
    const payload = globalThis.Buffer.from(JSON.stringify({ aud: "api", sub: "svc" }), "utf8").toString(
      "base64url",
    );
    const token = `h.${payload}.s`;
    assert.equal(pickBusinessCompanyUuid(token, partner, `${partner}.${company}`), company);
  } finally {
    if (backup !== undefined) process.env.GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX = backup;
    else delete process.env.GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX;
  }
});

test("pickBusinessCompanyUuid without trust bundle requires suffix UUID present in JWT scan", () => {
  const keys = ["GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX"] as const;
  const backup = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.GETT_BUSINESS_ID_TRUST_BUNDLE_SUFFIX = "false";
  try {
    const partner = "82e1b95a-8690-4c26-b45b-5465af3a1bd7";
    const company = "82873f01-496f-11f1-9c83-62331b97151b";
    const payload = globalThis.Buffer.from(JSON.stringify({ aud: "api", sub: "x" }), "utf8").toString(
      "base64url",
    );
    const token = `h.${payload}.s`;
    assert.equal(pickBusinessCompanyUuid(token, partner, `${partner}.${company}`), null);
  } finally {
    for (const k of keys) {
      if (backup[k] !== undefined) process.env[k] = backup[k];
      else delete process.env[k];
    }
  }
});

test("resolveDemandApiBaseUrlFromEnv matches explicit demand host", () => {
  assert.equal(
    resolveDemandApiBaseUrlFromEnv({
      gettDemandApiBaseUrl: "https://custom.gett.com/",
      gettApiBaseUrl: "https://api.gett.com",
    }),
    "https://custom.gett.com",
  );
});

test("mapGettOrderRow normalizes alternate fields", () => {
  const row = mapGettOrderRow({
    id: "abc-1",
    ride_status: "Completed",
    due_datetime: "2026-05-06T15:00:00Z",
    product_name: "Gett Comfort",
    driver_name: "Noam Levi",
  });
  assert.equal(row.orderId, "abc-1");
  assert.equal(row.status, "Completed");
  assert.equal(row.scheduledAt, "2026-05-06T15:00:00Z");
  assert.equal(row.productName, "Gett Comfort");
  assert.equal(row.driverName, "Noam Levi");
});
