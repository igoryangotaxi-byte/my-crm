import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listSalesLeads } from "@/lib/sales-operation/repository";
import { findDuplicateLeads } from "@/lib/sales-operation/dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const phone = url.searchParams.get("phone");
  const companyName = url.searchParams.get("company");
  const excludeId = url.searchParams.get("excludeId") ?? undefined;

  if (!email?.trim() && !phone?.trim() && !companyName?.trim()) {
    return Response.json({ ok: true, duplicates: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const existing = await listSalesLeads({ archive: "all" });
    const duplicates = findDuplicateLeads({ email, phone, companyName }, existing, { excludeId });
    return Response.json(
      { ok: true, duplicates },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to check duplicates." },
      { status: 500 },
    );
  }
}
