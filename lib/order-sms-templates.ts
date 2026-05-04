import type { RequestRideStatus } from "@/types/crm";

export type OrderSmsTemplateId = "preorder_request" | "immediate_request" | "driver_on_way";

export const ORDER_SMS_TEMPLATE_IDS: OrderSmsTemplateId[] = [
  "preorder_request",
  "immediate_request",
  "driver_on_way",
];

export const ORDER_SMS_TEMPLATE_META: Record<
  OrderSmsTemplateId,
  { label: string; description: string; placeholders: string[] }
> = {
  preorder_request: {
    label: "Pre-order requested",
    description: "Sent when a scheduled (pre-order) ride is created for address phones.",
    placeholders: ["{{requestedAt}}", "{{traceLine}}"],
  },
  immediate_request: {
    label: "Immediate ride requested",
    description: "Sent when an on-demand ride is created (no scheduled pickup time).",
    placeholders: ["{{requestedAt}}", "{{traceLine}}"],
  },
  driver_on_way: {
    label: "Driver assigned / on the way",
    description:
      "Sent when the order moves to driver assigned. Default text matches the legacy app; custom templates use placeholders.",
    placeholders: ["{{driverName}}", "{{carModel}}", "{{carPlate}}", "{{vehicleSummary}}", "{{driverNamePart}}"],
  },
};

/** SMS segments concatenated by gateways; keep reasonable upper bound for KV / Inforu. */
export const ORDER_SMS_TEMPLATE_MAX_LENGTH = 2000;

const SMS_REQUEST_TZ = "Asia/Jerusalem";

export function formatRideTimeForSms(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: SMS_REQUEST_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(date).replace(",", "");
  } catch {
    return date.toISOString();
  }
}

/** Matches legacy ` trace_id=…` suffix (leading space). */
export function formatTraceLine(traceId?: string | null): string {
  const tid = traceId?.trim();
  if (!tid) return "";
  return ` trace_id=${tid}`;
}

/**
 * Replace `{{token}}` placeholders. Unknown tokens stay unchanged (operators see literal {{x}} in preview).
 */
export function applyOrderSmsTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key] ?? "";
    }
    return `{{${key}}}`;
  });
}

export const DEFAULT_ORDER_SMS_TEMPLATES: Record<OrderSmsTemplateId, string> = {
  preorder_request:
    "Hey, someone requested a pre-order on {{requestedAt}} with Yango. Be ready on time and have a nice trip.{{traceLine}}",
  immediate_request:
    "Hey, someone requested a ride for you {{requestedAt}}. Be ready on time and have a nice trip.{{traceLine}}",
  /**
   * Display / reset value for editors. At runtime, when the merged template still equals this
   * string, `buildDriverOnWaySmsText` uses `legacyDriverOnWaySmsText` so edge cases match the
   * original app. Custom text diverges and uses `applyOrderSmsTemplate` + vars below.
   */
  driver_on_way:
    "Hey, your driver is on the way {{vehicleSummary}}{{driverNamePart}}.",
};

function mergeOrderSmsTemplates(
  overrides: Partial<Record<OrderSmsTemplateId, string>> | null | undefined,
): Record<OrderSmsTemplateId, string> {
  const out = { ...DEFAULT_ORDER_SMS_TEMPLATES };
  for (const id of ORDER_SMS_TEMPLATE_IDS) {
    const t = overrides?.[id];
    if (typeof t === "string" && t.trim()) {
      out[id] = t.trim();
    }
  }
  return out;
}

export function getMergedOrderSmsTemplates(
  overrides: Partial<Record<OrderSmsTemplateId, string>> | null | undefined,
): Record<OrderSmsTemplateId, string> {
  return mergeOrderSmsTemplates(overrides);
}

export type RequestRideSmsMeta = { traceId?: string | null };

export function buildRequestedRideSmsText(
  merged: Record<OrderSmsTemplateId, string>,
  scheduledAtIso: string | null,
  createdAtIso: string,
  meta?: RequestRideSmsMeta,
): string {
  const isPreorder = Boolean(scheduledAtIso?.trim());
  const id: OrderSmsTemplateId = isPreorder ? "preorder_request" : "immediate_request";
  const template = merged[id] ?? DEFAULT_ORDER_SMS_TEMPLATES[id];
  const requestedAt = formatRideTimeForSms(
    (isPreorder ? scheduledAtIso : createdAtIso) ?? createdAtIso,
  );
  const traceLine = formatTraceLine(meta?.traceId);
  return applyOrderSmsTemplate(template, {
    requestedAt,
    traceLine,
  });
}

/** Legacy driver SMS (exact pre-template behavior) for default template matching. */
export function legacyDriverOnWaySmsText(status: RequestRideStatus): string {
  const fullName =
    [status.driverFirstName ?? null, status.driverLastName ?? null].filter(Boolean).join(" ").trim() ||
    (status.driverName ?? "").trim();
  const carParts = [status.carModel?.trim(), status.carPlate?.trim()].filter(
    (entry): entry is string => Boolean(entry && entry.length > 0),
  );
  if (carParts.length > 0 && fullName) {
    return `Hey, your driver is on the way ${carParts.join(", ")}, ${fullName}.`;
  }
  if (carParts.length > 0) {
    return `Hey, your driver is on the way ${carParts.join(", ")}.`;
  }
  if (fullName) {
    return `Hey, your driver ${fullName} is on the way.`;
  }
  return "Hey, your driver is on the way.";
}

export function computeDriverOnWayTemplateVars(status: RequestRideStatus): Record<string, string> {
  const fullName =
    [status.driverFirstName ?? null, status.driverLastName ?? null].filter(Boolean).join(" ").trim() ||
    (status.driverName ?? "").trim();
  const carModel = (status.carModel ?? "").trim();
  const carPlate = (status.carPlate ?? "").trim();
  const parts = [carModel, carPlate].filter(Boolean);
  const vehicleSummary = parts.join(", ");
  let driverNamePart = "";
  if (vehicleSummary && fullName) {
    driverNamePart = `, ${fullName}`;
  }
  return {
    driverName: fullName,
    carModel,
    carPlate,
    vehicleSummary,
    driverNamePart,
  };
}

/**
 * When the merged template still equals the canonical default, keep legacy wording (all edge cases).
 * Otherwise apply placeholders from `computeDriverOnWayTemplateVars`.
 */
export function buildDriverOnWaySmsText(
  merged: Record<OrderSmsTemplateId, string>,
  status: RequestRideStatus,
): string {
  const template = merged.driver_on_way ?? DEFAULT_ORDER_SMS_TEMPLATES.driver_on_way;
  if (template.trim() === DEFAULT_ORDER_SMS_TEMPLATES.driver_on_way.trim()) {
    return legacyDriverOnWaySmsText(status);
  }
  const vars = computeDriverOnWayTemplateVars(status);
  let out = applyOrderSmsTemplate(template, vars);
  out = out.replace(/\s+\./g, ".");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}
