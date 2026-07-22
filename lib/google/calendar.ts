import { OAuth2Client } from "google-auth-library";
import { getSupabaseAdminClient } from "@/lib/supabase";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export type GoogleCalendarTokenRow = {
  userId: string;
  refreshToken: string;
  accessToken: string | null;
  expiryDate: string | null;
  scope: string | null;
};

function getClientId(): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  return clientId;
}

function getClientSecret(): string {
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not configured");
  return clientSecret;
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function resolveCalendarRedirectUri(origin: string): string {
  return (
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    `${origin}/api/google/calendar/callback`
  );
}

export function buildGoogleCalendarAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: params.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

export async function exchangeCalendarCode(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; accessToken: string | null; expiryDate: string | null }> {
  const client = new OAuth2Client({
    clientId: getClientId(),
    clientSecret: getClientSecret(),
    redirectUri,
  });
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Disconnect the app in Google Account permissions and try again.",
    );
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  };
}

export async function upsertCalendarTokens(
  userId: string,
  tokens: { refreshToken: string; accessToken: string | null; expiryDate: string | null },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("sales_google_calendar_tokens").upsert(
    {
      user_id: userId,
      refresh_token: tokens.refreshToken,
      access_token: tokens.accessToken,
      expiry_date: tokens.expiryDate,
      scope: CALENDAR_SCOPE,
      updated_at: now,
      created_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function getCalendarTokens(userId: string): Promise<GoogleCalendarTokenRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    userId: String(data.user_id),
    refreshToken: String(data.refresh_token),
    accessToken: typeof data.access_token === "string" ? data.access_token : null,
    expiryDate: typeof data.expiry_date === "string" ? data.expiry_date : null,
    scope: typeof data.scope === "string" ? data.scope : null,
  };
}

export async function deleteCalendarTokens(userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_google_calendar_tokens").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function getAuthedClient(userId: string): Promise<OAuth2Client> {
  const stored = await getCalendarTokens(userId);
  if (!stored) throw new Error("Google Calendar is not connected.");

  const client = new OAuth2Client({
    clientId: getClientId(),
    clientSecret: getClientSecret(),
  });
  client.setCredentials({
    refresh_token: stored.refreshToken,
    access_token: stored.accessToken ?? undefined,
    expiry_date: stored.expiryDate ? new Date(stored.expiryDate).getTime() : undefined,
  });

  client.on("tokens", (tokens) => {
    void upsertCalendarTokens(userId, {
      refreshToken: tokens.refresh_token || stored.refreshToken,
      accessToken: tokens.access_token ?? stored.accessToken,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : stored.expiryDate,
    }).catch((error) => {
      console.error("Failed to persist refreshed Google Calendar tokens:", error);
    });
  });

  return client;
}

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
};

export async function createGoogleCalendarEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<string> {
  const client = await getAuthedClient(userId);
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google Calendar access token.");

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      description: input.description ?? undefined,
      start: { dateTime: input.startsAt },
      end: { dateTime: input.endsAt },
    }),
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? "Failed to create Google Calendar event.");
  }
  return data.id;
}

export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  input: CalendarEventInput,
): Promise<void> {
  const client = await getAuthedClient(userId);
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google Calendar access token.");

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? undefined,
        start: { dateTime: input.startsAt },
        end: { dateTime: input.endsAt },
      }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? "Failed to update Google Calendar event.");
  }
}

export async function deleteGoogleCalendarEvent(userId: string, eventId: string): Promise<void> {
  const client = await getAuthedClient(userId);
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google Calendar access token.");

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  // 404/410 = already gone
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? "Failed to delete Google Calendar event.");
  }
}
