import {
  defaultClientMetricsRange,
  filterClientYangoRows,
  summarizeClientYangoMetrics,
  type SalesClientMetricsSummary,
} from "@/lib/sales-operation/client-overview-metrics";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  getSalesClientById,
  listSalesClientNotes,
  updateSalesClient,
} from "@/lib/sales-operation/repository";
import type { UpdateSalesClientInput } from "@/lib/sales-operation/manager-types";
import { loadAuthStore } from "@/lib/auth-store";
import { getYangoSupabaseOrderMetricsForRange } from "@/lib/yango-supabase";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function resolveManagerName(
  userId: string | null | undefined,
  explicitName: string | null | undefined,
  users: Array<{ id: string; name: string }>,
): string | null | undefined {
  if (userId === undefined) return explicitName;
  if (!userId) return null;
  if (explicitName?.trim()) return explicitName.trim();
  return users.find((user) => user.id === userId)?.name ?? null;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim() || defaultClientMetricsRange().from;
  const to = url.searchParams.get("to")?.trim() || defaultClientMetricsRange().to;

  try {
    const client = await getSalesClientById(id);
    if (!client) {
      return Response.json({ ok: false, error: "Client not found." }, { status: 404 });
    }
    const notes = await listSalesClientNotes(id);

    let metrics: SalesClientMetricsSummary | null = null;
    let trips: YangoSupabaseOrderMetric[] = [];
    if (client.corpClientId) {
      const rows = await getYangoSupabaseOrderMetricsForRange({
        corpClientId: client.corpClientId,
        since: `${from}T00:00:00.000Z`,
        till: `${to}T23:59:59.999Z`,
      });
      const filtered = filterClientYangoRows({
        rows,
        corpClientId: client.corpClientId,
        from,
        to,
      });
      metrics = summarizeClientYangoMetrics(filtered, from, to);
      trips = filtered
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
        .slice(0, 100);
    }

    return Response.json(
      { ok: true, client, notes, metrics, trips, range: { from, to } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load client." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  let body: UpdateSalesClientInput;
  try {
    body = (await request.json()) as UpdateSalesClientInput;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const store = await loadAuthStore();
    const client = await updateSalesClient(id, {
      corpClientId: body.corpClientId,
      accountManagerUserId: body.accountManagerUserId,
      accountManagerName: resolveManagerName(
        body.accountManagerUserId,
        body.accountManagerName,
        store.users,
      ),
      salesManagerUserId: body.salesManagerUserId,
      salesManagerName: resolveManagerName(body.salesManagerUserId, body.salesManagerName, store.users),
    });
    return Response.json({ ok: true, client }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update client." },
      { status: 500 },
    );
  }
}
