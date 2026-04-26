import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { requireApprovedUser } from "@/lib/server-auth";
import { sendInforuWhatsApp } from "@/lib/sms/inforu-whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type NotifyKind = "request_created" | "driver_on_way";

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

function isAllowedKind(value: unknown): value is NotifyKind {
  return value === "request_created" || value === "driver_on_way";
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
      { ok: false, error: "kind must be 'request_created' or 'driver_on_way'." },
      { status: 400 },
    );
  }

  try {
    const customerMessageId = orderId ? `${kind}:${orderId}` : undefined;
    const result = await sendInforuWhatsApp({ phones, text, customerMessageId });

    if (result.skipped) {
      return Response.json(
        { ok: true, skipped: true, message: result.description ?? "WhatsApp not configured." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!result.ok) {
      if (process.env.NODE_ENV !== "test") {
        console.error("[whatsapp]", kind, orderId, result.statusId, result.description);
      }
      const message = result.configError ?? result.description ?? "WhatsApp gateway error.";
      return Response.json(
        {
          ok: false,
          error: relabelGoogleVendorForDisplay(message),
          statusId: result.statusId,
        },
        { status: 502 },
      );
    }

    return Response.json(
      {
        ok: true,
        statusId: result.statusId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[whatsapp]", error);
    }
    const message = error instanceof Error ? error.message.trim() : "Failed to send WhatsApp.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(message || "Failed to send WhatsApp.") },
      { status: 500 },
    );
  }
}
