/**
 * Validates a post-login return path: same-origin relative URL only (no open redirect).
 * Accepts only paths starting with a single `/` (not `//`).
 */
function decodeReturnPath(value: string): string | null {
  try {
    let decoded = value.trim();
    for (let i = 0; i < 3; i += 1) {
      const next = decodeURIComponent(decoded.replace(/\+/g, " "));
      if (next === decoded) break;
      decoded = next;
    }
    return decoded.trim();
  } catch {
    return null;
  }
}

function isUnsafePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return true;
  if (path.includes("\\") || path.includes("\0")) return true;
  if (path.includes("@")) return true;
  if (/^https?:/i.test(path) || path.includes("://")) return true;
  if (/%2f%2f/i.test(path) || /%5c/i.test(path)) return true;
  if (/^\/?\//.test(path.replace(/^\//, ""))) return true;
  return false;
}

export function sanitizeSameOriginReturnPath(
  value: string | null | undefined,
): string | null {
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;

  const decoded = decodeReturnPath(trimmed);
  if (decoded == null || isUnsafePath(decoded)) return null;

  return decoded;
}
