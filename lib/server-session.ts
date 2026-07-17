import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "crm_session_v1";

type SessionPayload = {
  userId: string;
  issuedAt: number;
};

function getSessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.KV_REST_API_TOKEN ||
    "dev-only-session-secret"
  );
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  return Buffer.from(`${base64}${pad}`, "base64").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("hex");
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const chunks = cookieHeader.split(";").map((chunk) => chunk.trim());
  for (const chunk of chunks) {
    if (!chunk.startsWith(`${name}=`)) continue;
    return chunk.slice(name.length + 1) || null;
  }
  return null;
}

export function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    userId,
    issuedAt: Date.now(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signPayload(encodedPayload);
  const signatureBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expectedSignature, "utf8");
  if (signatureBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(signatureBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!parsed?.userId || typeof parsed.userId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionCookieOptions = {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
};

/**
 * Shared cookie config so every entry point (password login, Google SSO callback)
 * writes an identical `crm_session_v1` cookie.
 */
export function buildSessionSetCookie(userId: string): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(userId),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function buildSessionClearCookie(): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}

export function getSessionUserIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  const token = parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) return null;
  const payload = verifySessionToken(token);
  return payload?.userId ?? null;
}
