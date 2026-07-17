import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { logActivity } from "@/lib/sales-operation/activity";
import { sendInforuSms } from "@/lib/sms/inforu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) {
    return Response.json({ ok: false, error: "Message text is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: lead, error } = await supabase
    .from("sales_leads")
    .select("id, full_name, phone")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!lead) {
    return Response.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }
  const phone = typeof lead.phone === "string" ? lead.phone.trim() : "";
  if (!phone) {
    return Response.json({ ok: false, error: "Lead has no phone number." }, { status: 400 });
  }

  const result = await sendInforuSms({ phones: [phone], text, customerMessageId: `lead-${id}` });
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.configError ?? result.description },
      { status: 502 },
    );
  }

  await logActivity({
    leadId: id,
    type: "sms",
    title: "SMS sent",
    body: text,
    meta: { phone, recipients: result.numberOfRecipients },
    actor: { userId: auth.user.id, name: auth.user.name },
  });

  return Response.json({ ok: true, description: result.description });
}
