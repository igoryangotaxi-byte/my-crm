import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createSalesLead, listSalesLeads } from "@/lib/sales-operation/repository";
import type { CreateSalesLeadInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const leads = await listSalesLeads();
    return Response.json({ ok: true, leads }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load leads." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Partial<CreateSalesLeadInput> | null;
  if (!body?.fullName?.trim()) {
    return Response.json({ ok: false, error: "fullName is required." }, { status: 400 });
  }

  try {
    const lead = await createSalesLead(body as CreateSalesLeadInput, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create lead." },
      { status: 500 },
    );
  }
}
