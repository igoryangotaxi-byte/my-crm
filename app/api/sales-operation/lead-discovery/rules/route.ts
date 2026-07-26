import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  listDiscoveryRules,
  updateDiscoveryRule,
} from "@/lib/sales-operation/lead-discovery/repository";
import { DEFAULT_RULE_SET_ID } from "@/lib/sales-operation/lead-discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  // Advanced edits the global default set only. Campaign rules come from segment at create.
  const rules = await listDiscoveryRules(DEFAULT_RULE_SET_ID);
  return Response.json({ ok: true, rules });
}

export async function PATCH(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "Admin" && auth.user.role !== "Team Lead") {
    return Response.json({ ok: false, error: "Admin only." }, { status: 403 });
  }
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    weight?: number;
    enabled?: boolean;
    name?: string;
  } | null;
  if (!body?.id) return Response.json({ ok: false, error: "id required." }, { status: 400 });
  await updateDiscoveryRule(body.id, body);
  const rules = await listDiscoveryRules(DEFAULT_RULE_SET_ID);
  return Response.json({ ok: true, rules });
}
