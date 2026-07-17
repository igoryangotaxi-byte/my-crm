import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listLeadEmails, sendLeadEmail, type SendLeadEmailInput } from "@/lib/sales-operation/email";
import { isEmailSendingConfigured } from "@/lib/sales-operation/email-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const messages = await listLeadEmails(id);
    return Response.json(
      { ok: true, messages, sendingConfigured: isEmailSendingConfigured() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load emails." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as SendLeadEmailInput | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const message = await sendLeadEmail(id, body, { userId: auth.user.id, name: auth.user.name });
    return Response.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to send email.";
    const status = messageText.includes("not found")
      ? 404
      : messageText.includes("required")
        ? 400
        : 500;
    return Response.json({ ok: false, error: messageText }, { status });
  }
}
