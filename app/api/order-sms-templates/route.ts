import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import {
  DEFAULT_ORDER_SMS_TEMPLATES,
  ORDER_SMS_TEMPLATE_IDS,
  ORDER_SMS_TEMPLATE_MAX_LENGTH,
  type OrderSmsTemplateId,
  getMergedOrderSmsTemplates,
} from "@/lib/order-sms-templates";
import {
  loadOrderSmsTemplateDocument,
  saveOrderSmsTemplateOverrides,
} from "@/lib/order-sms-template-store";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateTemplates(
  templates: Partial<Record<OrderSmsTemplateId, string>>,
): { ok: true } | { ok: false; error: string } {
  for (const id of ORDER_SMS_TEMPLATE_IDS) {
    if (!Object.prototype.hasOwnProperty.call(templates, id)) continue;
    const t = templates[id];
    if (t === undefined) continue;
    if (typeof t !== "string") {
      return { ok: false, error: `Invalid template type for ${id}.` };
    }
    if (t.length > ORDER_SMS_TEMPLATE_MAX_LENGTH) {
      return {
        ok: false,
        error: `Template ${id} exceeds ${ORDER_SMS_TEMPLATE_MAX_LENGTH} characters.`,
      };
    }
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const tokenLabel = normalizeString(url.searchParams.get("tokenLabel"));
  const clientId = normalizeString(url.searchParams.get("clientId"));

  if (!tokenLabel || !clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId query parameters are required." },
      { status: 400 },
    );
  }

  try {
    const doc = await loadOrderSmsTemplateDocument(tokenLabel, clientId);
    const merged = getMergedOrderSmsTemplates(doc.templates);
    return Response.json(
      {
        ok: true,
        defaults: DEFAULT_ORDER_SMS_TEMPLATES,
        overrides: doc.templates,
        merged,
        history: doc.history.slice().reverse(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load templates.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(msg) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | {
        tokenLabel?: unknown;
        clientId?: unknown;
        templates?: Partial<Record<OrderSmsTemplateId, string>>;
      }
    | null;

  const tokenLabel = normalizeString(body?.tokenLabel);
  const clientId = normalizeString(body?.clientId);
  const templates = body?.templates ?? {};

  if (!tokenLabel || !clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId are required." },
      { status: 400 },
    );
  }

  const validation = validateTemplates(templates);
  if (!validation.ok) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const editorName =
    auth.user.name?.trim() ||
    auth.user.email?.trim() ||
    auth.user.id;

  try {
    const { doc, merged } = await saveOrderSmsTemplateOverrides({
      tokenLabel,
      clientId,
      templates,
      editorId: auth.user.id,
      editorName,
    });

    return Response.json(
      {
        ok: true,
        overrides: doc.templates,
        merged,
        history: doc.history.slice().reverse(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save templates.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(msg) },
      { status: 500 },
    );
  }
}
