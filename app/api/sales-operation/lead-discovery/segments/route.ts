import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  listDiscoverySegments,
  createDiscoverySegment,
  updateDiscoverySegment,
} from "@/lib/sales-operation/lead-discovery/repository";
import { recalculateSegment } from "@/lib/sales-operation/lead-discovery/segments";
import type { SegmentConditionGroup } from "@/lib/sales-operation/lead-discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const segments = await listDiscoverySegments();
  return Response.json({ ok: true, segments });
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    conditions?: SegmentConditionGroup;
    action?: string;
    id?: string;
  } | null;

  if (body?.action === "recalculate" && body.id && body.conditions) {
    const segment = await recalculateSegment(body.id, body.conditions);
    return Response.json({ ok: true, segment });
  }

  if (!body?.name) return Response.json({ ok: false, error: "name required." }, { status: 400 });
  const segment = await createDiscoverySegment({
    name: body.name,
    description: body.description,
    conditions: body.conditions,
  });
  if (body.conditions) {
    await recalculateSegment(segment.id, body.conditions);
  }
  return Response.json({ ok: true, segment }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    name?: string;
    description?: string | null;
    conditions?: SegmentConditionGroup;
  } | null;
  if (!body?.id) return Response.json({ ok: false, error: "id required." }, { status: 400 });
  const segment = await updateDiscoverySegment(body.id, body);
  if (body.conditions) await recalculateSegment(body.id, body.conditions);
  return Response.json({ ok: true, segment });
}
