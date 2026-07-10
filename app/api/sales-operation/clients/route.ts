import { isSupabaseConfigured } from "@/lib/supabase";
import { listB2BClientRegistry } from "@/lib/sales-operation/b2b-client-registry";
import { buildSalesClientListRows } from "@/lib/sales-operation/client-list";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listSalesClients } from "@/lib/sales-operation/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    // Keep this endpoint light: registry + signed clients only.
    // Avoid scanning gp_fct_order_raw metrics (can take tens of seconds).
    const [clients, registry] = await Promise.all([listSalesClients(), listB2BClientRegistry()]);
    const overviewClients = registry.map((entry) => ({
      corpClientId: entry.corpClientId,
      clientName: entry.clientName,
    }));
    const rows = buildSalesClientListRows(clients, registry, overviewClients);
    return Response.json(
      { ok: true, clients, registry, overviewClients, rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load clients." },
      { status: 500 },
    );
  }
}
