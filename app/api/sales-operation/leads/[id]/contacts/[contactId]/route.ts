import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deleteSalesContact, updateSalesContact } from "@/lib/sales-operation/contacts";
import type { UpdateSalesContactInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { contactId } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdateSalesContactInput | null;
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  }

  try {
    const contact = await updateSalesContact(contactId, body);
    return Response.json({ ok: true, contact });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update contact.";
    const status = message.includes("not found") ? 404 : message.includes("already exists") ? 409 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { contactId } = await context.params;
  try {
    await deleteSalesContact(contactId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete contact." },
      { status: 500 },
    );
  }
}
