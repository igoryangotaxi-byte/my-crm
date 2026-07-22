import { createHmac, timingSafeEqual } from "node:crypto";
import {
  exchangeCalendarCode,
  isGoogleCalendarConfigured,
  resolveCalendarRedirectUri,
  upsertCalendarTokens,
} from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-only-session-secret"
  );
}

function verifyState(state: string): { userId: string; returnTo: string } | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const raw = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = createHmac("sha256", getSecret()).update(raw).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: string; returnTo?: string };
    if (!parsed.userId) return null;
    return {
      userId: parsed.userId,
      returnTo: parsed.returnTo || "/sales-operation/calendar",
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    return Response.redirect(
      new URL("/sales-operation/calendar?gcal=error", url.origin),
      302,
    );
  }

  const verified = verifyState(state);
  if (!verified || !isGoogleCalendarConfigured()) {
    return Response.redirect(
      new URL("/sales-operation/calendar?gcal=error", url.origin),
      302,
    );
  }

  try {
    const origin = `${url.protocol}//${url.host}`;
    const redirectUri = resolveCalendarRedirectUri(origin);
    const tokens = await exchangeCalendarCode(code, redirectUri);
    await upsertCalendarTokens(verified.userId, tokens);
    const returnUrl = new URL(verified.returnTo, url.origin);
    returnUrl.searchParams.set("gcal", "connected");
    return Response.redirect(returnUrl, 302);
  } catch (err) {
    console.error("Google Calendar OAuth callback failed:", err);
    return Response.redirect(
      new URL("/sales-operation/calendar?gcal=error", url.origin),
      302,
    );
  }
}
