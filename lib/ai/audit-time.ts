export const AI_AUDIT_TIMEZONE = "Asia/Jerusalem";

export type AiAuditStamp = {
  timezone: typeof AI_AUDIT_TIMEZONE;
  atUtc: string;
  atLocal: string;
};

export function formatAiAuditStamp(now = new Date()): AiAuditStamp {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AI_AUDIT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    timezone: AI_AUDIT_TIMEZONE,
    atUtc: now.toISOString(),
    atLocal: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

export function withAiAudit(params: Record<string, unknown>, now = new Date()): Record<string, unknown> {
  return {
    ...params,
    _audit: formatAiAuditStamp(now),
  };
}
