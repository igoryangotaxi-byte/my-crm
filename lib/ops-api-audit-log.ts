const PHONE_LIKE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const TOKEN_LIKE = /\b(?:ya[_-]?[a-z0-9]{8,}|sk-[a-z0-9]{8,}|Bearer\s+\S+|YANGO_[A-Z0-9_]+=\S+)\b/gi;

export function maskSensitiveLogText(value: string): string {
  return value
   .replace(PHONE_LIKE, "[redacted-phone]")
    .replace(TOKEN_LIKE, "[redacted-token]");
}

export function stringifyOpsApiPermissionLog(payload: Record<string, unknown>): string {
  return maskSensitiveLogText(JSON.stringify(payload));
}
