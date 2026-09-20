export type TelephonyProviderName = "astradial" | "threecx" | "off";

export function isTelephonyEnabled(): boolean {
  const raw = process.env.TELEPHONY_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getTelephonyProviderName(): TelephonyProviderName {
  if (!isTelephonyEnabled()) return "off";
  const raw = (process.env.TELEPHONY_PROVIDER?.trim().toLowerCase() || "astradial") as string;
  if (raw === "threecx" || raw === "astradial" || raw === "off") return raw;
  return "astradial";
}

export type AstradialEnvConfig = {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string | null;
};

export function getAstradialEnvConfig(): AstradialEnvConfig | null {
  const apiUrl = process.env.ASTRADIAL_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.ASTRADIAL_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  const webhookSecret = process.env.ASTRADIAL_WEBHOOK_SECRET?.trim() || null;
  return { apiUrl, apiKey, webhookSecret };
}

export function isAstradialConfigured(): boolean {
  return getAstradialEnvConfig() !== null;
}
