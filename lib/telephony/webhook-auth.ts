import { createHmac, timingSafeEqual } from "node:crypto";
import { getAstradialEnvConfig } from "@/lib/telephony/env";

export function generateAstradialWebhookSignature(payload: unknown, secret: string): string {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyAstradialWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  maxSkewMs?: number;
}): { ok: true } | { ok: false; error: string; status: number } {
  const secret =
    process.env.ASTRADIAL_WEBHOOK_SECRET?.trim() ||
    getAstradialEnvConfig()?.webhookSecret ||
    null;
  if (!secret) {
    return { ok: false, error: "ASTRADIAL_WEBHOOK_SECRET is not configured.", status: 503 };
  }

  const signature = params.signatureHeader?.trim() || "";
  if (!signature) {
    return { ok: false, error: "Missing webhook signature.", status: 401 };
  }

  const expected = generateAstradialWebhookSignature(params.rawBody, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    // Also accept raw hex without sha256= prefix
    const alt = Buffer.from(expected.replace(/^sha256=/, ""));
    const sigHex = Buffer.from(signature.replace(/^sha256=/, ""));
    if (alt.length !== sigHex.length || !timingSafeEqual(alt, sigHex)) {
      return { ok: false, error: "Invalid webhook signature.", status: 401 };
    }
  }

  const maxSkew = params.maxSkewMs ?? 5 * 60 * 1000;
  if (params.timestampHeader) {
    const ts = Date.parse(params.timestampHeader);
    if (!Number.isNaN(ts) && Math.abs(Date.now() - ts) > maxSkew) {
      return { ok: false, error: "Webhook timestamp skew too large.", status: 401 };
    }
  }

  return { ok: true };
}
