import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  listDiscoveredLeads,
  getLeadDiscovery,
  getDiscoveryById,
  assignLeadStickers,
  upsertLeadDiscovery,
  approveDiscoveryToPipeline,
  listLeadStickers,
} from "@/lib/sales-operation/lead-discovery/repository";
import { getSalesLeadById, updateSalesLead } from "@/lib/sales-operation/repository";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const campaignId = new URL(request.url).searchParams.get("campaignId") || undefined;
  const leads = await listDiscoveredLeads(200, { campaignId });
  return Response.json({ ok: true, leads }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    leadId?: string;
    discoveryId?: string;
    action?: string;
  } | null;
  if (!body?.action) {
    return Response.json({ ok: false, error: "action required." }, { status: 400 });
  }

  try {
    if (body.action === "approve") {
      const discoveryId =
        body.discoveryId ||
        (body.leadId
          ? (await getLeadDiscovery(body.leadId))?.id ||
            (await getDiscoveryById(body.leadId))?.id
          : null);
      if (!discoveryId) {
        return Response.json({ ok: false, error: "discoveryId required." }, { status: 400 });
      }
      const result = await approveDiscoveryToPipeline(discoveryId, {
        userId: auth.user.id,
        name: auth.user.name,
      });
      return Response.json({ ok: true, leadId: result.leadId, discovery: result.discovery });
    }

    if (body.action === "disqualify") {
      const discovery =
        (body.discoveryId ? await getDiscoveryById(body.discoveryId) : null) ||
        (body.leadId ? await getLeadDiscovery(body.leadId) : null);
      if (!discovery) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
      const supabase = getSupabaseAdminClient();
      await supabase
        .from("sales_lead_discovery")
        .update({
          qualification_status: "disqualified",
          requires_manual_review: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", discovery.id);
      if (discovery.leadId) {
        await updateSalesLead(
          discovery.leadId,
          { status: "rejected" },
          { userId: auth.user.id, name: auth.user.name },
        );
      }
      return Response.json({ ok: true });
    }

    if (body.action === "mark_dnc") {
      if (!body.leadId && !body.discoveryId) {
        return Response.json({ ok: false, error: "leadId or discoveryId required." }, { status: 400 });
      }
      const discovery =
        (body.discoveryId ? await getDiscoveryById(body.discoveryId) : null) ||
        (body.leadId ? await getLeadDiscovery(body.leadId) : null);
      if (!discovery) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
      const supabase = getSupabaseAdminClient();
      await supabase
        .from("sales_lead_discovery")
        .update({ do_not_contact: true, updated_at: new Date().toISOString() })
        .eq("id", discovery.id);
      if (discovery.leadId) {
        await assignLeadStickers(discovery.leadId, ["do_not_contact"], { removable: false });
      }
      return Response.json({ ok: true });
    }

    if (body.action === "stickers" || body.action === "detail") {
      if (!body.leadId && !body.discoveryId) {
        return Response.json({ ok: false, error: "leadId or discoveryId required." }, { status: 400 });
      }
      const discovery =
        (body.discoveryId ? await getDiscoveryById(body.discoveryId) : null) ||
        (body.leadId ? await getLeadDiscovery(body.leadId) : null);
      if (!discovery) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
      const stickers = discovery.leadId
        ? await listLeadStickers(discovery.leadId)
        : discovery.pendingStickerKeys.map((key) => ({
            sticker_key: key,
            reason: null,
            assigned_by: "system",
            created_at: discovery.discoveredAt,
            removable: true,
          }));
      const pipelineLead = discovery.leadId ? await getSalesLeadById(discovery.leadId) : null;
      return Response.json({ ok: true, stickers, discovery, pipelineLead });
    }

    // Legacy patch helpers still used by older clients
    if (body.action === "clear_review" && body.leadId) {
      await upsertLeadDiscovery(body.leadId, { requires_manual_review: false });
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 },
    );
  }
}
