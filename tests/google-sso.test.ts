import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_WORKSPACE_DOMAIN,
  buildGoogleAuthUrl,
  isAllowedWorkspaceEmail,
} from "../lib/sso/google.ts";
import { resolveSsoRole } from "../lib/sso/provision.ts";

const DOMAIN = "appli.taxi";

describe("isAllowedWorkspaceEmail", () => {
  it("accepts a verified workspace account via hd claim", () => {
    assert.equal(
      isAllowedWorkspaceEmail(
        { email: "user@appli.taxi", emailVerified: true, hostedDomain: "appli.taxi" },
        DOMAIN,
      ),
      true,
    );
  });

  it("accepts a verified account via @domain suffix when hd is missing", () => {
    assert.equal(
      isAllowedWorkspaceEmail(
        { email: "user@appli.taxi", emailVerified: true, hostedDomain: null },
        DOMAIN,
      ),
      true,
    );
  });

  it("rejects a personal gmail account (no hd, wrong suffix)", () => {
    assert.equal(
      isAllowedWorkspaceEmail(
        { email: "someone@gmail.com", emailVerified: true, hostedDomain: null },
        DOMAIN,
      ),
      false,
    );
  });

  it("rejects an unverified email even on the right domain", () => {
    assert.equal(
      isAllowedWorkspaceEmail(
        { email: "user@appli.taxi", emailVerified: false, hostedDomain: "appli.taxi" },
        DOMAIN,
      ),
      false,
    );
  });

  it("rejects a different hosted domain", () => {
    assert.equal(
      isAllowedWorkspaceEmail(
        { email: "user@other.com", emailVerified: true, hostedDomain: "other.com" },
        DOMAIN,
      ),
      false,
    );
  });

  it("is case-insensitive on domain and email", () => {
    assert.equal(
      isAllowedWorkspaceEmail(
        { email: "User@Appli.Taxi", emailVerified: true, hostedDomain: null },
        "APPLI.TAXI",
      ),
      true,
    );
  });
});

describe("resolveSsoRole", () => {
  it("grants Admin to the seeded admin email", () => {
    assert.equal(resolveSsoRole("ig-kuznetsov@appli.taxi"), "Admin");
    assert.equal(resolveSsoRole("IG-Kuznetsov@Appli.Taxi"), "Admin");
  });

  it("grants User to any other workspace email", () => {
    assert.equal(resolveSsoRole("newperson@appli.taxi"), "User");
  });
});

describe("buildGoogleAuthUrl", () => {
  const url = buildGoogleAuthUrl({
    clientId: "test-client-id",
    redirectUri: "https://crm.example.com/api/auth/google/callback",
    state: "state-token-123",
    domain: DOMAIN,
  });
  const parsed = new URL(url);

  it("targets Google's OAuth endpoint", () => {
    assert.equal(parsed.origin + parsed.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("includes hd, scopes, state and redirect", () => {
    assert.equal(parsed.searchParams.get("hd"), DOMAIN);
    assert.equal(parsed.searchParams.get("scope"), "openid email profile");
    assert.equal(parsed.searchParams.get("state"), "state-token-123");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("client_id"), "test-client-id");
    assert.equal(
      parsed.searchParams.get("redirect_uri"),
      "https://crm.example.com/api/auth/google/callback",
    );
  });
});

describe("defaults", () => {
  it("defaults the workspace domain to appli.taxi", () => {
    assert.equal(DEFAULT_WORKSPACE_DOMAIN, "appli.taxi");
  });
});

describe("i18n — login keys", () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"));
  const he = JSON.parse(readFileSync(join(process.cwd(), "messages", "he.json"), "utf8"));
  const keys = [
    "signInWithGoogle",
    "errorDomain",
    "errorOAuth",
    "errorConfig",
    "errorRejected",
    "title",
    "subtitle",
  ];

  it("has a login section in both locales", () => {
    for (const key of keys) {
      assert.ok(en.login?.[key], `en.login.${key} missing`);
      assert.ok(he.login?.[key], `he.login.${key} missing`);
    }
  });
});

describe("password auth disabled", () => {
  const route = readFileSync(join(process.cwd(), "app", "api", "auth", "route.ts"), "utf8");

  it("returns 410 for password login and register", () => {
    assert.match(route, /Password login is disabled/);
    assert.match(route, /Registration is disabled/);
  });
});
