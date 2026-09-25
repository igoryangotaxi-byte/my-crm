import { NextResponse } from "next/server";
import {
  exchangeCodeAndVerify,
  isAllowedWorkspaceEmail,
  isGoogleSsoConfigured,
  resolveRedirectUri,
} from "@/lib/sso/google";
import { persistGoogleWorkspaceTokens } from "@/lib/google/persist-workspace-tokens";
import { findOrProvisionSsoUser } from "@/lib/sso/provision";
import { loadAuthStore } from "@/lib/auth-store";
import { mergeAllRolePermissions, CURRENT_PERMISSIONS_VERSION } from "@/lib/role-permissions";
import { resolveAuthenticatedLandingPath } from "@/lib/login-redirect";
import { buildSessionSetCookie } from "@/lib/server-session";
import { sanitizeSameOriginReturnPath } from "@/lib/safe-return-url";
import type { AppPageKey, AppRole } from "@/types/auth";

export const dynamic = "force-dynamic";

const STATE_COOKIE_NAME = "google_oauth_state";
const RETURN_COOKIE_NAME = "google_oauth_next";

function loginRedirect(origin: string, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, origin));
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  if (!isGoogleSsoConfigured()) {
    return loginRedirect(origin, "config");
  }

  if (url.searchParams.get("error") === "access_denied") {
    return loginRedirect(origin, "consent");
  }
  if (url.searchParams.get("error")) {
    return loginRedirect(origin, "oauth");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${STATE_COOKIE_NAME}=`))
    ?.slice(STATE_COOKIE_NAME.length + 1);

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return loginRedirect(origin, "oauth");
  }

  try {
    const redirectUri = resolveRedirectUri(origin);
    const identity = await exchangeCodeAndVerify(code, redirectUri);

    if (!isAllowedWorkspaceEmail(identity)) {
      return loginRedirect(origin, "domain");
    }

    const provisioned = await findOrProvisionSsoUser({
      email: identity.email,
      name: identity.name,
    });
    if (!provisioned.ok) {
      return loginRedirect(origin, "rejected");
    }

    try {
      const { recordUserLogin } = await import("@/lib/auth-store");
      await recordUserLogin(provisioned.user, { force: true });
    } catch (error) {
      console.warn("Failed to record SSO last login:", error);
    }

    try {
      await persistGoogleWorkspaceTokens(provisioned.user.id, {
        ...identity.credentials,
        email: identity.email,
      });
    } catch (error) {
      console.error("Failed to persist Google Workspace tokens:", error);
    }

    // Land on a page the user can actually open. Hardcoding /sales-operation/pipeline
    // caused a login ↔ pipeline flicker for roles without Appli Taxi CRM access (e.g. User).
    const returnCookie = cookieHeader
      .split(";")
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith(`${RETURN_COOKIE_NAME}=`))
      ?.slice(RETURN_COOKIE_NAME.length + 1);
    const returnPath = sanitizeSameOriginReturnPath(returnCookie ?? null);

    let landing = "/login";
    try {
      const store = await loadAuthStore();
      const rolePermissions = mergeAllRolePermissions(
        store.rolePermissions,
        store.storeMeta?.permissionsVersion ?? CURRENT_PERMISSIONS_VERSION,
      );
      const role = provisioned.user.role as AppRole;
      const pages = rolePermissions[role];
      const canAccess = (page: AppPageKey) => Boolean(pages?.[page]);
      landing =
        resolveAuthenticatedLandingPath({
          accountType: provisioned.user.accountType,
          canAccess,
          returnPath,
        });
    } catch (error) {
      console.error("Failed to resolve post-login path:", error);
      landing = "/login";
    }

    const response = NextResponse.redirect(new URL(landing, origin));
    response.cookies.set(buildSessionSetCookie(provisioned.user.id));
    response.cookies.set({
      name: STATE_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set({
      name: RETURN_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return loginRedirect(origin, "oauth");
  }
}
