import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  deleteEmailTemplate,
  updateEmailTemplate,
  type UpdateEmailTemplateInput,
} from "@/lib/sales-operation/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { templateId } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdateEmailTemplateInput | null;
  if (!body || Object.keys(body).length === 0) {
    return Response.json({ ok: false, error: "No fields to update." }, { status: 400 });
  }

  try {
    const template = await updateEmailTemplate(templateId, body);
    return Response.json({ ok: true, template });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update template." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { templateId } = await context.params;
  try {
    await deleteEmailTemplate(templateId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete template." },
      { status: 500 },
    );
  }
}
