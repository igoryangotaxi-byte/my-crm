import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, isGoogleSsoConfigured, resolveRedirectUri } from "@/lib/sso/google";

export const dynamic = "force-dynamic";

const STATE_COOKIE_NAME = "google_oauth_state";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  if (!isGoogleSsoConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = resolveRedirectUri(origin);
  const authUrl = buildGoogleAuthUrl({ redirectUri, state });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
