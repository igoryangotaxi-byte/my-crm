import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createSalesLead, listSalesLeads } from "@/lib/sales-operation/repository";
import { findDuplicateLeads } from "@/lib/sales-operation/dedup";
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
  // Data quality: a lead must be reachable by email or phone.
  if (!body.email?.trim() && !body.phone?.trim()) {
    return Response.json(
      { ok: false, error: "Provide at least an email or a phone." },
      { status: 400 },
    );
  }

  try {
    const existing = await listSalesLeads({ archive: "all" });
    const duplicates = findDuplicateLeads(
      { email: body.email, phone: body.phone, companyName: body.companyName },
      existing,
    );
    const lead = await createSalesLead(body as CreateSalesLeadInput, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, lead, duplicates }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create lead." },
      { status: 500 },
    );
  }
}
