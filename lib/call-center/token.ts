import { getThreeCxEnvConfig, type ThreeCxEnvConfig } from "@/lib/call-center/env";

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cached: CachedToken | null = null;

const EXPIRY_SKEW_MS = 60_000;

export function clearThreeCxTokenCache(): void {
  cached = null;
}

export function buildTokenRequestBody(config: ThreeCxEnvConfig): URLSearchParams {
  return new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

export async function getThreeCxAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAtMs > now + EXPIRY_SKEW_MS) {
    return cached.accessToken;
  }

  const config = getThreeCxEnvConfig();
  if (!config) {
    throw new Error("3CX is not configured (THREECX_BASE_URL / CLIENT_ID / CLIENT_SECRET).");
  }

  const res = await fetchImpl(`${config.baseUrl}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildTokenRequestBody(config),
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || `HTTP ${res.status}`;
    clearThreeCxTokenCache();
    throw new Error(`3CX token request failed: ${detail}`);
  }

  const expiresInSec = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  cached = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return cached.accessToken;
}
