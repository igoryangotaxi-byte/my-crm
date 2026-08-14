export const GOOGLE_OPENID_SCOPES = ["openid", "email", "profile"] as const;

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

export const GOOGLE_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export const GOOGLE_WORKSPACE_SCOPES = [
  ...GOOGLE_OPENID_SCOPES,
  ...GOOGLE_CALENDAR_SCOPES,
  ...GOOGLE_GMAIL_SCOPES,
].join(" ");

export type GoogleOAuthCredentials = {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: string | null;
  scope: string | null;
};

export function parseGrantedScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? "").split(/\s+/).filter(Boolean));
}

export function hasRequiredScopes(
  granted: Set<string> | string | null | undefined,
  required: readonly string[],
): boolean {
  const set = granted instanceof Set ? granted : parseGrantedScopes(granted);
  return required.every((scope) => set.has(scope));
}

export function resolvePersistedRefreshToken(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (next) return next;
  const prev = existing?.trim();
  return prev || null;
}
