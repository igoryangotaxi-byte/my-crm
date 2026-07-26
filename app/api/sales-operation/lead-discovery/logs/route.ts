import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  listDiscoveryLogs,
} from "@/lib/sales-operation/lead-discovery/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const logs = await listDiscoveryLogs(200);
  const sanitized =
    auth.user.role === "Admin"
      ? logs
      : logs.map((l) => {
          const row = l as Record<string, unknown>;
          return {
            id: row.id,
            level: row.level,
            event: row.event,
            message: row.message,
            created_at: row.created_at,
            campaign_id: row.campaign_id,
            lead_id: row.lead_id,
          };
        });
  return Response.json({ ok: true, logs: sanitized });
}
