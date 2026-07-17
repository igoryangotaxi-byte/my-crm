import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { AUDIT_ENTITY_TYPES, listAuditLog, type AuditEntityType } from "@/lib/sales-operation/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const entityTypeRaw = url.searchParams.get("entityType");
  const entityType =
    entityTypeRaw && (AUDIT_ENTITY_TYPES as readonly string[]).includes(entityTypeRaw)
      ? (entityTypeRaw as AuditEntityType)
      : undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  try {
    const entries = await listAuditLog({ entityType, entityId, limit });
    return Response.json({ ok: true, entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load audit log." },
      { status: 500 },
    );
  }
}
