import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  listDiscoveryCampaigns,
  createDiscoveryCampaign,
  createCampaignRuleSet,
} from "@/lib/sales-operation/lead-discovery/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled()) {
    return Response.json({ ok: false, error: "Lead Discovery is disabled." }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const campaigns = await listDiscoveryCampaigns();
    return Response.json({ ok: true, campaigns }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list campaigns." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled()) {
    return Response.json({ ok: false, error: "Lead Discovery is disabled." }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.name || typeof body.name !== "string") {
    return Response.json({ ok: false, error: "name is required." }, { status: 400 });
  }
  try {
    const description = typeof body.description === "string" ? body.description : null;
    let ruleSetId: string | undefined =
      typeof body.ruleSetId === "string" ? body.ruleSetId : undefined;

    const qualificationRules = Array.isArray(body.qualificationRules)
      ? body.qualificationRules
          .map((r) => {
            if (!r || typeof r !== "object") return null;
            const o = r as Record<string, unknown>;
            if (typeof o.signalKey !== "string") return null;
            return {
              signalKey: o.signalKey,
              enabled: typeof o.enabled === "boolean" ? o.enabled : undefined,
              weight: typeof o.weight === "number" ? o.weight : undefined,
            } as { signalKey: string; enabled?: boolean; weight?: number };
          })
          .filter((r): r is { signalKey: string; enabled?: boolean; weight?: number } => r != null)
      : [];

    if (!ruleSetId && qualificationRules.length) {
      ruleSetId = await createCampaignRuleSet({
        name: `Campaign · ${body.name}`.slice(0, 120),
        description,
        overrides: qualificationRules,
      });
    }

    const campaign = await createDiscoveryCampaign(
      {
        name: body.name,
        description,
        cities: Array.isArray(body.cities) ? body.cities.map(String) : undefined,
        categories: Array.isArray(body.categories) ? body.categories.map(String) : undefined,
        keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : undefined,
        mapsQueries: Array.isArray(body.mapsQueries) ? body.mapsQueries.map(String) : undefined,
        excludedKeywords: Array.isArray(body.excludedKeywords)
          ? body.excludedKeywords.map(String)
          : undefined,
        minTaxiScore: typeof body.minTaxiScore === "number" ? body.minTaxiScore : undefined,
        companySizeMode: body.companySizeMode as never,
        dailyLeadTarget: typeof body.dailyLeadTarget === "number" ? body.dailyLeadTarget : undefined,
        maxLeadsPerRun: typeof body.maxLeadsPerRun === "number" ? body.maxLeadsPerRun : undefined,
        manualApproval: body.manualApproval !== false,
        autoAddToPipeline: body.autoAddToPipeline !== false,
        status: (body.status as never) ?? "draft",
        ruleSetId: ruleSetId ?? undefined,
        defaultOwnerUserId:
          typeof body.defaultOwnerUserId === "string" ? body.defaultOwnerUserId : null,
        defaultOwnerName: typeof body.defaultOwnerName === "string" ? body.defaultOwnerName : null,
      },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, campaign }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create campaign." },
      { status: 500 },
    );
  }
}
