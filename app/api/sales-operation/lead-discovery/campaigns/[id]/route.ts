import { isSupabaseConfigured, getSupabaseAdminClient } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  getDiscoveryCampaign,
  updateDiscoveryCampaign,
  deleteDiscoveryCampaign,
  writeDiscoveryLog,
} from "@/lib/sales-operation/lead-discovery/repository";
import { runDiscoveryCampaign } from "@/lib/sales-operation/lead-discovery/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function cancelCampaignWork(campaignId: string) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from("sales_discovery_runs")
    .update({
      status: "cancelled",
      finished_at: now,
      error_message: "Campaign stopped by user",
    })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "running"]);
  await supabase
    .from("sales_discovery_jobs")
    .update({
      status: "cancelled",
      updated_at: now,
      error_message: "Campaign stopped by user",
    })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "running"]);
}

export async function GET(request: Request, context: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const { id } = await context.params;
  const campaign = await getDiscoveryCampaign(id);
  if (!campaign) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  return Response.json({ ok: true, campaign });
}

export async function DELETE(request: Request, context: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    await deleteDiscoveryCampaign(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  try {
    const campaign = await updateDiscoveryCampaign(id, body as never);
    return Response.json({ ok: true, campaign });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Update failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "run";
  try {
    if (action === "pause" || action === "stop") {
      await cancelCampaignWork(id);
      const campaign = await updateDiscoveryCampaign(id, {
        status: "paused",
        lastError: null,
      });
      await writeDiscoveryLog({
        event: "campaign_stopped",
        message: `Campaign ${campaign.name} stopped by ${auth.user.name}`,
        campaignId: id,
      });
      return Response.json({ ok: true, campaign });
    }
    if (action === "start") {
      const campaign = await updateDiscoveryCampaign(id, {
        status: "active",
        lastError: null,
        // Ensure scheduled campaigns can produce candidates (Places rarely has firm headcount).
        companySizeMode: "include_unknown",
      });
      await writeDiscoveryLog({
        event: "campaign_started",
        message: `Campaign ${campaign.name} activated by ${auth.user.name}`,
        campaignId: id,
      });
      return Response.json({ ok: true, campaign, shouldRun: true });
    }
    const existing = await getDiscoveryCampaign(id);
    if (!existing) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    if (existing.status === "error") {
      await updateDiscoveryCampaign(id, { status: "draft", lastError: null });
    }
    // Cancel any stuck prior run for this campaign before starting a new one.
    await cancelCampaignWork(id);
    const result = await runDiscoveryCampaign(id, { userId: auth.user.id, name: auth.user.name });
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 },
    );
  }
}
