/**
 * Validates a post-login return path: same-origin relative URL only (no open redirect).
 */
export function sanitizeSameOriginReturnPath(
  value: string | null | undefined,
): string | null {
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  if (/^https?:/i.test(trimmed)) return null;
  if (trimmed.includes("@")) return null;
  if (trimmed.includes("\0")) return null;
  return trimmed;
}
