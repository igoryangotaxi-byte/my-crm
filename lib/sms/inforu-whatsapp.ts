/**
 * Inforu WhatsApp (Business) — REST JSON on capi.inforu.co.il.
 *
 * Public docs hub: https://apidoc.inforu.co.il/
 * Send operation used here: POST https://capi.inforu.co.il/api/v2/WhatsApp/SendWhatsApp?view=json
 *
 * Auth: same credentials as SMS — `INFORU_USERNAME` + `INFORU_API_TOKEN` as HTTP Basic (user:token).
 *
 * WhatsApp messages use an **approved template** in your Inforu account. This helper sends one
 * **Text** parameter (default placeholder name `[#1#]`) whose value is the full notification string.
 * Create a matching template in Inforu, then set `INFORU_WHATSAPP_TEMPLATE_ID` (and optionally
 * `INFORU_WHATSAPP_BODY_PLACEHOLDER` if your first text slot is not `[#1#]`).
 */

import { dedupePhones } from "@/lib/phone-utils";

const SEND_URL = "https://capi.inforu.co.il/api/v2/WhatsApp/SendWhatsApp?view=json";
const REQUEST_TIMEOUT_MS = 20_000;

export type SendInforuWhatsAppInput = {
  phones: string[];
  /** Full message body placed into the template text parameter. */
  text: string;
  customerMessageId?: string;
};

export type InforuWhatsAppResult = {
  ok: boolean;
  skipped?: boolean;
  statusId?: number;
  description?: string;
  raw?: string;
  configError?: string;
};

function readEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function readTemplateId(): number | null {
  const raw = readEnv("INFORU_WHATSAPP_TEMPLATE_ID");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function basicAuthHeader(username: string, apiToken: string): string {
  const pair = `${username}:${apiToken}`;
  const b64 = Buffer.from(pair, "utf8").toString("base64");
  return `Basic ${b64}`;
}

/**
 * Sends one template message to multiple recipients in a single request.
 * Each recipient receives the same `text` bound to the configured body placeholder.
 */
export async function sendInforuWhatsApp(input: SendInforuWhatsAppInput): Promise<InforuWhatsAppResult> {
  const username = readEnv("INFORU_USERNAME");
  const apiToken = readEnv("INFORU_API_TOKEN");
  const templateId = readTemplateId();
  const placeholder = readEnv("INFORU_WHATSAPP_BODY_PLACEHOLDER") || "[#1#]";

  if (!username || !apiToken) {
    return {
      ok: false,
      configError: "Missing INFORU_USERNAME or INFORU_API_TOKEN (same as SMS).",
    };
  }
  if (templateId == null) {
    return { ok: true, skipped: true, description: "INFORU_WHATSAPP_TEMPLATE_ID not set." };
  }

  const phones = dedupePhones(input.phones ?? []);
  if (phones.length === 0) {
    return { ok: false, description: "No valid recipient phone numbers." };
  }

  const text = (input.text ?? "").trim();
  if (!text) {
    return { ok: false, description: "Message text is empty." };
  }

  const recipients = phones.map((Phone) => ({ Phone }));

  const settings: Record<string, unknown> = {};
  if (input.customerMessageId) {
    settings.CustomerParameter = input.customerMessageId.slice(0, 240);
  }

  const bodyObj = {
    Data: {
      TemplateId: templateId,
      TemplateParameters: [
        {
          Name: placeholder,
          Type: "Text",
          Value: text.slice(0, 4000),
        },
      ],
      Recipients: recipients,
      ...(Object.keys(settings).length > 0 ? { Settings: settings } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json",
        Authorization: basicAuthHeader(username, apiToken),
      },
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      json = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        description: `HTTP ${response.status}: ${raw.slice(0, 800)}`,
        raw: raw.slice(0, 2000),
      };
    }

    if (!json) {
      return { ok: false, description: "Non-JSON response from WhatsApp gateway.", raw: raw.slice(0, 2000) };
    }

    // Unauthenticated / invalid requests often echo a field schema with "_INT_" placeholders (no StatusId).
    const rawProbe = raw.includes("_INT_") || raw.includes("_STRING_");
    if (rawProbe && json.StatusId == null && json.statusId == null) {
      return {
        ok: false,
        description:
          "WhatsApp gateway echoed a request schema instead of sending (wrong Basic auth, invalid TemplateId, or malformed JSON). Verify INFORU_USERNAME + INFORU_API_TOKEN and INFORU_WHATSAPP_TEMPLATE_ID.",
        raw: raw.slice(0, 2000),
      };
    }

    const statusId =
      typeof json.StatusId === "number"
        ? json.StatusId
        : typeof json.statusId === "number"
          ? json.statusId
          : Number.NaN;
    const statusDescription =
      typeof json.StatusDescription === "string"
        ? json.StatusDescription
        : typeof json.statusDescription === "string"
          ? json.statusDescription
          : typeof json.DetailedDescription === "string"
            ? json.DetailedDescription
            : "";

    // Success envelope used across Inforu capi (see community examples): StatusId === 1
    if (statusId === 1) {
      return { ok: true, statusId: 1, description: statusDescription || "Success", raw: raw.slice(0, 2000) };
    }

    return {
      ok: false,
      statusId: Number.isFinite(statusId) ? statusId : undefined,
      description: statusDescription || raw.slice(0, 500) || "WhatsApp send rejected.",
      raw: raw.slice(0, 2000),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, description: `Transport error: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
