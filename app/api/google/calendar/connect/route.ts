import { createHmac, randomBytes } from "node:crypto";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  buildGoogleCalendarAuthUrl,
  isGoogleCalendarConfigured,
  resolveCalendarRedirectUri,
} from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signState(payload: string): string {
  const secret =
    process.env.AUTH_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-only-session-secret";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isGoogleCalendarConfigured()) {
    return Response.json({ ok: false, error: "Google Calendar OAuth is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const redirectUri = resolveCalendarRedirectUri(origin);
  const nonce = randomBytes(16).toString("hex");
  const raw = JSON.stringify({
    userId: auth.user.id,
    nonce,
    returnTo: url.searchParams.get("returnTo") || "/sales-operation/calendar",
  });
  const state = `${Buffer.from(raw).toString("base64url")}.${signState(raw)}`;

  const authUrl = buildGoogleCalendarAuthUrl({ redirectUri, state });
  return Response.redirect(authUrl, 302);
}
