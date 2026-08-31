export type ThreeCxEnvConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Company-wide 3CX Call Control credentials (not per-user). */
export function getThreeCxEnvConfig(): ThreeCxEnvConfig | null {
  const baseUrl = process.env.THREECX_BASE_URL?.trim();
  const clientId = process.env.THREECX_CLIENT_ID?.trim();
  const clientSecret = process.env.THREECX_CLIENT_SECRET?.trim();
  if (!baseUrl || !clientId || !clientSecret) return null;
  return {
    baseUrl: trimTrailingSlash(baseUrl),
    clientId,
    clientSecret,
  };
}

export function isThreeCxConfigured(): boolean {
  return getThreeCxEnvConfig() !== null;
}
