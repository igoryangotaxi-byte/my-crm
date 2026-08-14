import { getCalendarTokens, upsertCalendarTokens } from "@/lib/google/calendar";
import { getGmailTokens, upsertGmailTokens } from "@/lib/ai/gmail";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_GMAIL_SCOPES,
  GOOGLE_WORKSPACE_SCOPES,
  type GoogleOAuthCredentials,
  hasRequiredScopes,
  parseGrantedScopes,
  resolvePersistedRefreshToken,
} from "@/lib/google/workspace-oauth";

export async function persistGoogleWorkspaceTokens(
  userId: string,
  credentials: GoogleOAuthCredentials & { email?: string | null },
): Promise<{ calendar: boolean; gmail: boolean }> {
  const granted = parseGrantedScopes(credentials.scope);
  if (granted.size === 0 && credentials.refreshToken) {
    for (const scope of GOOGLE_WORKSPACE_SCOPES.split(/\s+/)) granted.add(scope);
  }
  const existingCalendar = await getCalendarTokens(userId).catch(() => null);
  const existingGmail = await getGmailTokens(userId).catch(() => null);
  const refreshToken = resolvePersistedRefreshToken(
    credentials.refreshToken,
    existingCalendar?.refreshToken ?? existingGmail?.refreshToken,
  );
  if (!refreshToken) {
    return { calendar: false, gmail: false };
  }

  const expiryDate = credentials.expiryDate ?? existingCalendar?.expiryDate ?? existingGmail?.expiryDate ?? null;
  const accessToken = credentials.accessToken ?? existingCalendar?.accessToken ?? existingGmail?.accessToken ?? null;
  const persistCalendar = hasRequiredScopes(granted, GOOGLE_CALENDAR_SCOPES);
  const persistGmail = hasRequiredScopes(granted, GOOGLE_GMAIL_SCOPES);
  const scope = credentials.scope ?? existingCalendar?.scope ?? existingGmail?.scope ?? null;

  if (persistCalendar) {
    await upsertCalendarTokens(userId, {
      refreshToken,
      accessToken,
      expiryDate,
      scope,
    });
  }
  if (persistGmail) {
    await upsertGmailTokens(userId, {
      refreshToken,
      accessToken,
      expiryDate,
      scope,
      email: credentials.email ?? existingGmail?.email ?? null,
    });
  }

  return { calendar: persistCalendar, gmail: persistGmail };
}
