import { NextResponse } from "next/server";
import {
  exchangeCodeAndVerify,
  isAllowedWorkspaceEmail,
  isGoogleSsoConfigured,
  resolveRedirectUri,
} from "@/lib/sso/google";
import { findOrProvisionSsoUser } from "@/lib/sso/provision";
import { buildSessionSetCookie } from "@/lib/server-session";

export const dynamic = "force-dynamic";

const STATE_COOKIE_NAME = "google_oauth_state";

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

    const response = NextResponse.redirect(new URL("/dashboard", origin));
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
    return response;
  } catch {
    return loginRedirect(origin, "oauth");
  }
}
