import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  getDiscoverySettings,
  updateDiscoverySettings,
  bumpGroqUsage,
} from "@/lib/sales-operation/lead-discovery/repository";
import { groqHealthCheck, isGroqConfigured, defaultGroqModel } from "@/lib/sales-operation/lead-discovery/groq";
import { isGooglePlacesConfigured, createGooglePlacesSource } from "@/lib/sales-operation/lead-discovery/places-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const settings = await getDiscoverySettings();
  const groq = await groqHealthCheck();
  const places = createGooglePlacesSource();
  const placesHealth = await places.healthCheck().catch((e) => ({
    ok: false,
    message: e instanceof Error ? e.message : "failed",
  }));
  return Response.json({
    ok: true,
    settings: {
      ...settings,
      groqKeyConfigured: isGroqConfigured(),
      placesConfigured: isGooglePlacesConfigured(),
      defaultModel: defaultGroqModel(),
    },
    health: { groq, places: placesHealth },
  });
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "Admin") {
    return Response.json({ ok: false, error: "Admin only." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    dailyQualifiedTarget?: number;
    groqEnabled?: boolean;
    groqModel?: string;
    groqDailyRequestLimit?: number;
    forceRulesOnly?: boolean;
  } | null;

  if (body?.action === "test") {
    const health = await groqHealthCheck();
    if (health.ok) await bumpGroqUsage(true);
    return Response.json({ ok: health.ok, health });
  }

  const settings = await updateDiscoverySettings({
    dailyQualifiedTarget: body?.dailyQualifiedTarget,
    groqEnabled: body?.groqEnabled,
    groqModel: body?.groqModel,
    groqDailyRequestLimit: body?.groqDailyRequestLimit,
    forceRulesOnly: body?.forceRulesOnly,
    resetGroqCounter: body?.action === "reset_counter",
  });
  return Response.json({ ok: true, settings });
}
