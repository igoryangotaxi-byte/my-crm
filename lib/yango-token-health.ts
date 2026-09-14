/** Pure helpers for Yango token live/dead classification. Never log or return secrets. */

export type YangoTokenHealthStatus = "live" | "dead" | "empty";

export type YangoTokenHealth = {
  label: string;
  clientName: string | null;
  status: YangoTokenHealthStatus;
  message: string | null;
};

export const YANGO_TOKEN_ONBOARDING_HREF = "/sales-operation/api-health-check";
export const NOTES_ONBOARDING_HREF = "/notes";

export function isYangoAuthFailureMessage(message: string): boolean {
  const raw = message.trim();
  const lower = raw.toLowerCase();
  return (
    /\bHTTP (401|403)\b/.test(raw) ||
    lower.includes("unauthorized") ||
    lower.includes("invalid token") ||
    lower.includes("token expired") ||
    lower.includes("token is not configured") ||
    lower.includes("authentication") && lower.includes("fail")
  );
}

/**
 * Fail closed: missing token → empty; any probe error → dead; success → live.
 * Callers must probe at most once and must not retry on dead/empty.
 */
export function classifyYangoTokenProbe(input: {
  configured: boolean;
  errorMessage?: string | null;
}): YangoTokenHealthStatus {
  if (!input.configured) return "empty";
  if (input.errorMessage) return "dead";
  return "live";
}

export function safeYangoTokenMessage(status: YangoTokenHealthStatus, errorMessage?: string | null): string | null {
  if (status === "empty") return "Token is not configured.";
  if (status === "dead") {
    if (errorMessage && isYangoAuthFailureMessage(errorMessage)) {
      return "Token expired or rejected. Reconnect in Notes.";
    }
    return "Yango token is not live. Fail closed — no retry.";
  }
  return null;
}
