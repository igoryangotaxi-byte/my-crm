import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { GOOGLE_GMAIL_SCOPES } from "@/lib/google/workspace-oauth";

export type GmailTokenRow = {
  userId: string;
  refreshToken: string;
  accessToken: string | null;
  expiryDate: string | null;
  scope: string | null;
  email: string | null;
};

const GMAIL_SCOPES = GOOGLE_GMAIL_SCOPES.join(" ");

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

export function isGmailOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function resolveGmailRedirectUri(origin: string): string {
  return process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim() || `${origin}/api/ai/integrations/gmail/callback`;
}

export function buildGmailAuthUrl(params: { redirectUri: string; state: string }): string {
  const query = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: params.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const { OAuth2Client } = await import("google-auth-library");
  const client = new OAuth2Client({
    clientId: getClientId(),
    clientSecret: getClientSecret(),
    redirectUri,
  });
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a Gmail refresh token. Disconnect the app and try again.");
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  };
}

export async function upsertGmailTokens(
  userId: string,
  tokens: {
    refreshToken: string;
    accessToken: string | null;
    expiryDate: string | null;
    email?: string | null;
    scope?: string | null;
  },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("ai_gmail_tokens").upsert(
    {
      user_id: userId,
      refresh_token: tokens.refreshToken,
      access_token: tokens.accessToken,
      expiry_date: tokens.expiryDate,
      scope: tokens.scope?.trim() || GMAIL_SCOPES,
      email: tokens.email ?? null,
      updated_at: now,
      created_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function getGmailTokens(userId: string): Promise<GmailTokenRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("ai_gmail_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    userId: String(data.user_id),
    refreshToken: String(data.refresh_token),
    accessToken: typeof data.access_token === "string" ? data.access_token : null,
    expiryDate: typeof data.expiry_date === "string" ? data.expiry_date : null,
    scope: typeof data.scope === "string" ? data.scope : null,
    email: typeof data.email === "string" ? data.email : null,
  };
}

export async function deleteGmailTokens(userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("ai_gmail_tokens").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function getAuthedGmailClient(userId: string) {
  const stored = await getGmailTokens(userId);
  if (!stored) throw new Error("Gmail is not connected.");
  const { OAuth2Client } = await import("google-auth-library");
  const client = new OAuth2Client({ clientId: getClientId(), clientSecret: getClientSecret() });
  client.setCredentials({
    refresh_token: stored.refreshToken,
    access_token: stored.accessToken ?? undefined,
    expiry_date: stored.expiryDate ? new Date(stored.expiryDate).getTime() : undefined,
  });
  return { client, stored };
}

async function gmailFetch(userId: string, path: string, init?: RequestInit) {
  const { client } = await getAuthedGmailClient(userId);
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Gmail access token.");
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Gmail API ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function searchGmail(userId: string, query: string, max = 8) {
  const data = (await gmailFetch(
    userId,
    `users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
  )) as { messages?: Array<{ id: string }> };
  const ids = (data.messages ?? []).map((m) => m.id).slice(0, max);
  const messages = [];
  for (const id of ids) {
    const msg = (await gmailFetch(
      userId,
      `users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    )) as {
      id: string;
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const headers = Object.fromEntries(
      (msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
    );
    messages.push({
      id: msg.id,
      subject: headers.subject ?? "",
      from: headers.from ?? "",
      date: headers.date ?? "",
      snippet: msg.snippet ?? "",
    });
  }
  return messages;
}

export async function readGmail(userId: string, messageId: string) {
  const msg = (await gmailFetch(userId, `users/me/messages/${encodeURIComponent(messageId)}?format=full`)) as {
    id: string;
    snippet?: string;
    payload?: {
      headers?: Array<{ name: string; value: string }>;
      body?: { data?: string };
      parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
    };
  };
  const headers = Object.fromEntries(
    (msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
  );
  const decode = (data?: string) =>
    data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
  let body = decode(msg.payload?.body?.data);
  if (!body && msg.payload?.parts) {
    const textPart = msg.payload.parts.find((p) => p.mimeType === "text/plain");
    body = decode(textPart?.body?.data);
  }
  return {
    id: msg.id,
    subject: headers.subject ?? "",
    from: headers.from ?? "",
    to: headers.to ?? "",
    date: headers.date ?? "",
    snippet: msg.snippet ?? "",
    body: body.slice(0, 8000),
  };
}

export async function createGmailDraft(userId: string, input: { to: string; subject: string; body: string }) {
  const raw = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  return gmailFetch(userId, "users/me/drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw: encoded } }),
  });
}

export async function sendGmail(userId: string, input: { to: string; subject: string; body: string }) {
  const raw = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  return gmailFetch(userId, "users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });
}
