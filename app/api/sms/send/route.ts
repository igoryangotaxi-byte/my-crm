import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { requireApprovedUser } from "@/lib/server-auth";
import { sendInforuSms } from "@/lib/sms/inforu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SmsKind = "request_created" | "driver_on_way" | "communications";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhonesInput(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      out.push(entry.trim());
    }
  }
  return out;
}

function isAllowedKind(value: unknown): value is SmsKind {
  return value === "request_created" || value === "driver_on_way" || value === "communications";
}

/** SMS is opt-in until Inforu enables outbound for the API user (KYC). */
function isInforuSmsSendEnabled(): boolean {
  const v = process.env.INFORU_SMS_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | {
        phones?: unknown;
        text?: unknown;
        orderId?: unknown;
        kind?: unknown;
      }
    | null;

  const text = normalizeString(body?.text);
  const phones = normalizePhonesInput(body?.phones);
  const orderId = normalizeString(body?.orderId);
  const kind = isAllowedKind(body?.kind) ? body.kind : null;

  if (!text) {
    return Response.json({ ok: false, error: "Text is required." }, { status: 400 });
  }
  if (phones.length === 0) {
    return Response.json({ ok: false, error: "At least one recipient is required." }, { status: 400 });
  }
  if (!kind) {
    return Response.json(
      { ok: false, error: "kind must be 'request_created', 'driver_on_way' or 'communications'." },
      { status: 400 },
    );
  }

  if (!isInforuSmsSendEnabled()) {
    return Response.json(
      {
        ok: true,
        skipped: true,
        reason:
          "SMS outbound is disabled until INFORU_SMS_ENABLED=true (Inforu KYC / API send must be cleared first).",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const customerMessageId = orderId ? `${kind}:${orderId}` : undefined;
    const result = await sendInforuSms({ phones, text, customerMessageId });

    if (!result.ok) {
      if (process.env.NODE_ENV !== "test") {
        console.error("[sms]", kind, orderId, result.statusCode, result.description);
      }
      const message = result.configError ?? result.description ?? "SMS gateway error.";
      return Response.json(
        {
          ok: false,
          error: relabelGoogleVendorForDisplay(message),
          statusCode: result.statusCode,
        },
        { status: 502 },
      );
    }

    return Response.json(
      {
        ok: true,
        sent: result.numberOfRecipients,
        statusCode: result.statusCode,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[sms]", error);
    }
    const message = error instanceof Error ? error.message.trim() : "Failed to send SMS.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(message || "Failed to send SMS.") },
      { status: 500 },
    );
  }
}
