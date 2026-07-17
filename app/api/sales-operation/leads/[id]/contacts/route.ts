import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createSalesContact, listSalesContacts } from "@/lib/sales-operation/contacts";
import type { CreateSalesContactInput } from "@/lib/sales-operation/types";

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
    const contacts = await listSalesContacts(id);
    return Response.json({ ok: true, contacts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load contacts." },
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
  const body = (await request.json().catch(() => null)) as CreateSalesContactInput | null;
  if (!body?.fullName?.trim()) {
    return Response.json({ ok: false, error: "fullName is required." }, { status: 400 });
  }

  try {
    const contact = await createSalesContact(id, body, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, contact }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create contact.";
    const status = message.includes("not found") ? 404 : message.includes("already exists") ? 409 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
