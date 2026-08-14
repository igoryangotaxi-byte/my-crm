import { createHmac, timingSafeEqual } from "node:crypto";
import {
  exchangeGmailCode,
  isGmailOAuthConfigured,
  resolveGmailRedirectUri,
  upsertGmailTokens,
} from "@/lib/ai/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyState(state: string): { userId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const secret = process.env.AUTH_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string };
    return data.userId ? { userId: data.userId } : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const errorRedirect = `${origin}/sales-operation/settings?gmail=error`;
  if (!isGmailOAuthConfigured()) return Response.redirect(errorRedirect);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return Response.redirect(errorRedirect);
  const verified = verifyState(state);
  if (!verified) return Response.redirect(errorRedirect);
  try {
    const tokens = await exchangeGmailCode(code, resolveGmailRedirectUri(origin));
    await upsertGmailTokens(verified.userId, tokens);
    return Response.redirect(`${origin}/sales-operation/settings?gmail=connected`);
  } catch {
    return Response.redirect(errorRedirect);
  }
}
