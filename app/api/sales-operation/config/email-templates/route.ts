import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  createEmailTemplate,
  listEmailTemplates,
  type CreateEmailTemplateInput,
} from "@/lib/sales-operation/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Composing emails needs the template list — allow any pipeline viewer.
  const authPipeline = await requireSalesOperationPage(request, "salesPipeline");
  const auth = authPipeline.ok
    ? authPipeline
    : await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("activeOnly") === "1";
  try {
    const templates = await listEmailTemplates({ activeOnly });
    return Response.json({ ok: true, templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list templates." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Partial<CreateEmailTemplateInput> | null;
  if (!body?.name?.trim()) {
    return Response.json({ ok: false, error: "Template name is required." }, { status: 400 });
  }

  try {
    const template = await createEmailTemplate(body as CreateEmailTemplateInput, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create template." },
      { status: 500 },
    );
  }
}
