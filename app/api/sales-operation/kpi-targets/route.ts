import { isSupabaseConfigured } from "@/lib/supabase";
import { loadAuthStore } from "@/lib/auth-store";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isKpiTargetPeriodType,
  listKpiTargets,
  upsertKpiTarget,
  type KpiTargetPeriodType,
} from "@/lib/sales-operation/kpi-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function userHasSettingsAccess(role: string): Promise<boolean> {
  const store = await loadAuthStore();
  const permissions = store.rolePermissions[role as keyof typeof store.rolePermissions];
  return Boolean(permissions?.salesSettings);
}

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesManagerAnalytics");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const isAdmin = await userHasSettingsAccess(auth.user.role);
  const requestedManager = url.searchParams.get("managerUserId")?.trim() || null;
  const managerUserId = isAdmin ? requestedManager : auth.user.id;

  const periodTypeParam = url.searchParams.get("periodType")?.trim();
  const periodType: KpiTargetPeriodType | null =
    periodTypeParam && isKpiTargetPeriodType(periodTypeParam) ? periodTypeParam : null;
  const periodStart = url.searchParams.get("periodStart")?.trim() || null;

  try {
    const targets = await listKpiTargets({ managerUserId, periodType, periodStart });
    return Response.json({ ok: true, targets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load targets." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSettings");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const target = await upsertKpiTarget(
      {
        managerUserId: String(body.managerUserId ?? ""),
        metricKey: String(body.metricKey ?? ""),
        periodType: String(body.periodType ?? ""),
        periodStart: String(body.periodStart ?? ""),
        targetValue: Number(body.targetValue ?? 0),
      },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, target });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save target." },
      { status: 400 },
    );
  }
}
