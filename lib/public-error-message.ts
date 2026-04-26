/**
 * User-visible errors: keep full technical detail, but rebrand third-party routing
 * vendor names to **Appli Taxi** (product copy requirement).
 */

export function relabelGoogleVendorForDisplay(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(/\bGOOGLE_MAPS_API_KEY\b/g, "Appli Taxi routing key");
  s = s.replace(/X-Goog-[A-Za-z-]+/g, "Appli Taxi routing header");
  s = s.replace(/type\.googleapis\.com[^\s"']*/gi, "Appli Taxi routing detail");
  s = s.replace(/\broutes\.googleapis\.com\b/gi, "Appli Taxi routing host");
  s = s.replace(/googleapis\.com/gi, "Appli Taxi routing");
  s = s.replace(/\bGoogle Maps\b/gi, "Appli Taxi maps");
  s = s.replace(/\bGoogle\b/g, "Appli Taxi");
  s = s.replace(/\bapi\.inforu\.co\.il\b/gi, "Appli Taxi SMS gateway");
  s = s.replace(/\bInforu\b/gi, "Appli Taxi SMS gateway");
  return s;
}

const MAX_USER_ERROR_LEN = 12_000;

/**
 * Full error text for the UI (HTTP bodies, JSON, etc.), with Google vendor strings relabeled.
 */
export function userVisibleError(message: unknown, fallback: string): string {
  const raw =
    typeof message === "string"
      ? message
      : message instanceof Error
        ? message.message
        : "";
  const t = raw.trim();
  if (!t) return fallback;
  const capped = t.length > MAX_USER_ERROR_LEN ? `${t.slice(0, MAX_USER_ERROR_LEN)}…` : t;
  return relabelGoogleVendorForDisplay(capped);
}

/** @deprecated Prefer {@link userVisibleError}; kept for existing imports. */
export const publicErrorMessage = userVisibleError;
