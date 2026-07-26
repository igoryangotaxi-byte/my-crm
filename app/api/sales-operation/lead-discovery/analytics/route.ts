import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  getOverviewStats,
  getDiscoverySettings,
} from "@/lib/sales-operation/lead-discovery/repository";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const overview = await getOverviewStats();
  const settings = await getDiscoverySettings();
  const supabase = getSupabaseAdminClient();
  const { data: daily } = await supabase
    .from("sales_discovery_daily_stats")
    .select("*")
    .order("day", { ascending: false })
    .limit(30);
  const { data: byCity } = await supabase
    .from("sales_lead_discovery")
    .select("city, taxi_potential_score, qualification_status");

  const cityMap = new Map<string, number>();
  const scoreBuckets = { high: 0, medium: 0, low: 0, disqualified: 0 };
  for (const row of byCity ?? []) {
    const r = row as Record<string, unknown>;
    const city = String(r.city ?? "Unknown");
    cityMap.set(city, (cityMap.get(city) ?? 0) + 1);
    const q = String(r.qualification_status ?? "");
    if (q === "high_potential") scoreBuckets.high += 1;
    else if (q === "medium_potential") scoreBuckets.medium += 1;
    else if (q === "low_potential") scoreBuckets.low += 1;
    else if (q === "disqualified") scoreBuckets.disqualified += 1;
  }

  return Response.json({
    ok: true,
    overview,
    settings,
    daily: daily ?? [],
    byCity: [...cityMap.entries()].map(([city, count]) => ({ city, count })),
    scoreBuckets,
    groqUsage: {
      used: settings.groqRequestsUsedToday,
      limit: settings.groqDailyRequestLimit,
      rulesFallback: settings.forceRulesOnly,
    },
  });
}
