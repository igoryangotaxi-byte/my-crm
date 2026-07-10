import { isSupabaseConfigured } from "@/lib/supabase";
import { listB2BClientRegistry } from "@/lib/sales-operation/b2b-client-registry";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authB2b = await requireSalesOperationPage(request, "salesB2BClients");
  const auth = authB2b.ok
    ? authB2b
    : await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const registry = await listB2BClientRegistry();
    return Response.json({ ok: true, registry }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load registry." },
      { status: 500 },
    );
  }
}
