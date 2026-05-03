/**
 * Inforu SMS gateway helper (server-side only).
 *
 * Docs: https://www.inforu.co.il/wp-content/uploads/2020/12/SMS_API-6.1.pdf
 *
 * Endpoint: POST https://api.inforu.co.il/SendMessageXml.ashx
 * Form body: `InforuXML=<UrlEncoded UTF-8 XML>`
 *
 * Required env vars:
 *   - INFORU_USERNAME
 *   - INFORU_API_TOKEN
 *   - INFORU_SENDER (sender id; latin letters/digits, ≤11 letters or 14 digits)
 */

import { dedupePhones } from "@/lib/phone-utils";

const INFORU_URL = "https://api.inforu.co.il/SendMessageXml.ashx";
const REQUEST_TIMEOUT_MS = 15_000;

export type SendInforuSmsInput = {
  phones: string[];
  text: string;
  /** Optional client-side message id surfaced in delivery callbacks/reports. */
  customerMessageId?: string;
};

export type InforuSendResult = {
  ok: boolean;
  /** Number of recipients the gateway accepted. */
  numberOfRecipients: number;
  /** Inforu numeric status code; 1 = OK. */
  statusCode: number;
  /** Inforu response description (English). */
  description: string;
  /** Set when the request didn't even leave the app (config/validation issue). */
  configError?: string;
};

/** Status code → English description (per PDF, "Response XML"). */
const STATUS_DESCRIPTIONS: Record<number, string> = {
  1: "Message accepted successfully",
  [-1]: "Failed",
  [-2]: "Bad user name or password",
  [-6]: "RecipientsDataNotExists",
  [-9]: "MessageTextNotExists",
  [-11]: "IllegalXML",
  [-13]: "UserQuotaExceeded",
  [-14]: "ProjectQuotaExceeded",
  [-15]: "CustomerQuotaExceeded",
  [-16]: "WrongDateTime",
  [-17]: "WrongNumberParameter",
  [-18]: "No valid recipients",
  [-20]: "InvalidSenderNumber",
  [-21]: "InvalidSenderName",
  [-22]: "UserBlocked",
  [-26]: "UserAuthenticationError",
  [-28]: "NetworkTypeNotSupported",
  [-29]: "NotAllNetworkTypesSupported",
  [-90]:
    "Invalid sender ID: use a sender approved in your Inforu account (usually Latin letters/digits, max 11 letters or 14 digits; Hebrew display names often need a separate registered Latin sender).",
  [-94]: "SenderId is not in allow list",
};

function describeStatus(code: number, fallback: string): string {
  return STATUS_DESCRIPTIONS[code] ?? fallback ?? `Status ${code}`;
}

/** Status -11: server-side XML parse failed — append typical integration causes. */
function augmentIllegalXmlHint(resolvedDescription: string, rawDescription: string): string {
  const probe = `${resolvedDescription} ${rawDescription}`;
  if (!/illegal\s*xml|\b-11\b/i.test(probe)) return resolvedDescription;
  const hint =
    "Typical causes: unescaped & < > \" ' in Username, ApiToken, Message, PhoneNumber, or Sender; tag names not matching SMS API 6.1 (e.g. Username/ApiToken); POST body not UTF-8; InforuXML double-URL-encoded; or sending XML via GET so the query string is truncated. Validate the exact XML against the PDF example before encodeURIComponent(InforuXML).";
  if (resolvedDescription.includes("Typical causes:")) return resolvedDescription;
  return `${resolvedDescription.trim()} — ${hint}`;
}

/** When Inforu returns KYC / unverified-account text, append a clear next step for operators. */
function augmentInforuKycHint(resolvedDescription: string, rawDescription: string): string {
  const probe = `${resolvedDescription} ${rawDescription}`;
  if (!/unverified\s+account|\bkyc\b/i.test(probe)) return resolvedDescription;
  const hint =
    "The Appli Taxi SMS gateway API still reports an account/KYC block even if the web portal looks normal. Ask Inforu support to enable outbound SMS for this API user (send them the exact error text, endpoint https://api.inforu.co.il/SendMessageXml.ashx, and your Customer ID + Username from Account Details). Changing the sender name in this app does not clear an API-side KYC flag.";
  if (resolvedDescription.includes("Changing the sender name")) return resolvedDescription;
  return `${resolvedDescription.trim()} — ${hint}`;
}

/** Minimal XML escape for text nodes. */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function readEnv(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function buildXml(input: {
  username: string;
  apiToken: string;
  text: string;
  recipients: string;
  sender: string;
  customerMessageId?: string;
}): string {
  const optional = input.customerMessageId
    ? `\n  <CustomerMessageID>${escapeXmlText(input.customerMessageId)}</CustomerMessageID>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<Inforu>
  <User>
    <Username>${escapeXmlText(input.username)}</Username>
    <ApiToken>${escapeXmlText(input.apiToken)}</ApiToken>
  </User>
  <Content Type="sms">
    <Message>${escapeXmlText(input.text)}</Message>
  </Content>
  <Recipients>
    <PhoneNumber>${escapeXmlText(input.recipients)}</PhoneNumber>
  </Recipients>
  <Settings>
    <Sender>${escapeXmlText(input.sender)}</Sender>${optional}
  </Settings>
</Inforu>`;
}

/** Lightweight extraction — Inforu responses are tiny and well-formed XML. */
function extractTagValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return m[1].trim();
}

function parseResponse(xml: string): InforuSendResult {
  const statusText = extractTagValue(xml, "Status");
  const description = extractTagValue(xml, "Description");
  const numberOfRecipientsText = extractTagValue(xml, "NumberOfRecipients");

  const statusCode = statusText != null ? Number(statusText) : Number.NaN;
  const numberOfRecipients = numberOfRecipientsText != null ? Number(numberOfRecipientsText) : 0;
  const baseDescription = describeStatus(statusCode, description ?? "");
  const finalDescription = augmentInforuKycHint(
    augmentIllegalXmlHint(baseDescription, description ?? ""),
    description ?? "",
  );

  return {
    ok: statusCode === 1,
    statusCode: Number.isFinite(statusCode) ? statusCode : -1,
    numberOfRecipients: Number.isFinite(numberOfRecipients) ? numberOfRecipients : 0,
    description: finalDescription,
  };
}

/**
 * Send an SMS via the Inforu gateway. Returns a structured result; never throws
 * for transport errors — callers can decide how to surface failures.
 */
export async function sendInforuSms(input: SendInforuSmsInput): Promise<InforuSendResult> {
  const username = readEnv("INFORU_USERNAME");
  const apiToken = readEnv("INFORU_API_TOKEN");
  const sender = readEnv("INFORU_SENDER") || "AppliTaxi";

  if (!username || !apiToken) {
    return {
      ok: false,
      statusCode: -1,
      numberOfRecipients: 0,
      description: "SMS gateway not configured",
      configError:
        "Missing INFORU_USERNAME or INFORU_API_TOKEN. Add both to .env.local in the project root (same folder as package.json), save the file, then fully restart `npm run dev` (or set them in Vercel → Environment Variables and redeploy).",
    };
  }

  const phones = dedupePhones(input.phones ?? []);
  if (phones.length === 0) {
    return {
      ok: false,
      statusCode: -18,
      numberOfRecipients: 0,
      description: describeStatus(-18, "No valid recipients"),
    };
  }

  const text = (input.text ?? "").trim();
  if (!text) {
    return {
      ok: false,
      statusCode: -9,
      numberOfRecipients: 0,
      description: describeStatus(-9, "MessageTextNotExists"),
    };
  }

  const xml = buildXml({
    username,
    apiToken,
    text,
    recipients: phones.join(";"),
    sender,
    customerMessageId: input.customerMessageId,
  });

  const body = `InforuXML=${encodeURIComponent(xml)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(INFORU_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    const xmlText = await response.text();

    if (!response.ok) {
      const httpBit = `HTTP ${response.status}: ${xmlText.slice(0, 500) || response.statusText}`;
      return {
        ok: false,
        statusCode: -1,
        numberOfRecipients: 0,
        description: augmentInforuKycHint(httpBit, xmlText),
      };
    }

    return parseResponse(xmlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      statusCode: -1,
      numberOfRecipients: 0,
      description: `Transport error: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
