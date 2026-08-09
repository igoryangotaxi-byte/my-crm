import { isSupabaseConfigured } from "@/lib/supabase";
import {
  requireRouteBundlesAccess,
  requireRouteBundlesSettingsWrite,
} from "@/lib/route-bundles/access";
import { getRouteBundleSettings, updateRouteBundleSettings } from "@/lib/route-bundles/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  const settings = await getRouteBundleSettings();
  return Response.json(
    {
      ok: true,
      settings,
      googleConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const auth = await requireRouteBundlesSettingsWrite(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const settings = await updateRouteBundleSettings(
      {
        maxOrdersPerBundle: num(body.maxOrdersPerBundle),
        minSafetyBufferMin: num(body.minSafetyBufferMin),
        maxEmptyDriveKm: num(body.maxEmptyDriveKm),
        trafficAware: bool(body.trafficAware),
        autoGenerateSuggestions: bool(body.autoGenerateSuggestions),
        allowInsertIntoAccepted: bool(body.allowInsertIntoAccepted),
        serviceDurationFallbackMin: num(body.serviceDurationFallbackMin),
        maxMatrixCellsPerGenerate: num(body.maxMatrixCellsPerGenerate),
        maxCandidateOrders: num(body.maxCandidateOrders),
      },
      auth.user.id,
    );
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save settings." },
      { status: 500 },
    );
  }
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}
