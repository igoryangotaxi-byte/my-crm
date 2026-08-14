import { requireApprovedUser } from "@/lib/server-auth";
import { buildGmailAuthUrl, isGmailOAuthConfigured, resolveGmailRedirectUri } from "@/lib/ai/gmail";
import { createHmac } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signState(payload: string): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isGmailOAuthConfigured()) {
    return Response.json({ ok: false, error: "Gmail OAuth is not configured." }, { status: 500 });
  }
  const origin = new URL(request.url).origin;
  const payload = Buffer.from(JSON.stringify({ userId: auth.user.id, t: Date.now() })).toString("base64url");
  const url = buildGmailAuthUrl({
    redirectUri: resolveGmailRedirectUri(origin),
    state: signState(payload),
  });
  return Response.redirect(url);
}
