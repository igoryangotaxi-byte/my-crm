import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function getSecret(): string {
  const secret =
    process.env.AI_TOOL_GATEWAY_SECRET?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("AI_TOOL_GATEWAY_SECRET is not configured.");
  return secret;
}

export function mintToolGatewayToken(userId: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ userId, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToolGatewayToken(token: string): { userId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string;
      exp?: number;
    };
    if (!data.userId || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

export function isToolGatewayServiceRequest(request: Request): { userId: string } | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const verified = verifyToolGatewayToken(header.slice("Bearer ".length).trim());
  if (!verified) return null;
  const actingAs = request.headers.get("x-appli-acting-as")?.trim();
  if (actingAs && actingAs !== verified.userId) return null;
  return verified;
}
