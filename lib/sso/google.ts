import { OAuth2Client } from "google-auth-library";

export const DEFAULT_WORKSPACE_DOMAIN = "appli.taxi";

export type GoogleIdentity = {
  email: string;
  emailVerified: boolean;
  hostedDomain: string | null;
  name: string | null;
  sub: string;
};

export function getWorkspaceDomain(): string {
  return (process.env.GOOGLE_WORKSPACE_DOMAIN || DEFAULT_WORKSPACE_DOMAIN).trim().toLowerCase();
}

function getClientId(): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  }
  return clientId;
}

function getClientSecret(): string {
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not configured");
  }
  return clientSecret;
}

export function isGoogleSsoConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function resolveRedirectUri(origin: string): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/auth/google/callback`;
}

/**
 * Build the Google OAuth 2.0 authorization URL. `hd` hints the account chooser to the
 * workspace domain, but is NOT a security boundary — the callback re-verifies the domain.
 */
export function buildGoogleAuthUrl(params: {
  clientId?: string;
  redirectUri: string;
  state: string;
  domain?: string;
}): string {
  const clientId = params.clientId ?? getClientId();
  const domain = (params.domain ?? getWorkspaceDomain()).trim().toLowerCase();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    hd: domain,
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state: params.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

/**
 * Exchange the authorization code for tokens and verify the ID token signature/audience.
 * Returns the verified identity claims.
 */
export async function exchangeCodeAndVerify(
  code: string,
  redirectUri: string,
): Promise<GoogleIdentity> {
  const clientId = getClientId();
  const client = new OAuth2Client({
    clientId,
    clientSecret: getClientSecret(),
    redirectUri,
  });

  const { tokens } = await client.getToken(code);
  const idToken = tokens.id_token;
  if (!idToken) {
    throw new Error("Google did not return an ID token");
  }

  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.sub) {
    throw new Error("Google ID token is missing required claims");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    emailVerified: payload.email_verified === true,
    hostedDomain: payload.hd ? payload.hd.trim().toLowerCase() : null,
    name: payload.name ?? null,
    sub: payload.sub,
  };
}

/**
 * Pure domain gate: requires a verified email that belongs to the workspace domain.
 * Accepts either the `hd` claim (preferred, org-managed accounts) or an `@domain` suffix.
 * Rejects personal gmail (no `hd`, non-matching suffix) and unverified emails.
 */
export function isAllowedWorkspaceEmail(
  identity: Pick<GoogleIdentity, "email" | "emailVerified" | "hostedDomain">,
  domain: string = getWorkspaceDomain(),
): boolean {
  if (!identity.emailVerified) return false;
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain) return false;
  const email = identity.email.trim().toLowerCase();
  if (identity.hostedDomain && identity.hostedDomain.trim().toLowerCase() === normalizedDomain) {
    return true;
  }
  return email.endsWith(`@${normalizedDomain}`);
}
