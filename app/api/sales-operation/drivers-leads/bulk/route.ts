import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  bulkAssignDriverLeads,
  bulkDeleteDriverLeads,
  bulkTransitionDriverLeads,
} from "@/lib/drivers-pipeline/repository";
import { isDriverLeadStatus } from "@/lib/drivers-pipeline/status-transitions";
import type { DriverLeadStatus } from "@/lib/drivers-pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkBody =
  | { action: "delete"; ids: string[] }
  | {
      action: "transition";
      ids: string[];
      toStatus: DriverLeadStatus;
      rejectedSubstatus?: string | null;
    }
  | {
      action: "assign";
      ids: string[];
      assignedManagerUserId: string | null;
      assignedManagerName?: string | null;
    };

function readIds(body: { ids?: unknown }): string[] {
  if (!Array.isArray(body.ids)) return [];
  return body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesDriversPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as BulkBody | null;
  if (!body || typeof body !== "object" || !("action" in body)) {
    return Response.json({ ok: false, error: "Invalid bulk payload." }, { status: 400 });
  }

  const ids = readIds(body);
  if (ids.length === 0) {
    return Response.json({ ok: false, error: "Select at least one lead." }, { status: 400 });
  }

  const actor = { userId: auth.user.id, name: auth.user.name };

  try {
    if (body.action === "delete") {
      const updated = await bulkDeleteDriverLeads(ids);
      return Response.json({ ok: true, updated, action: "delete" });
    }

    if (body.action === "assign") {
      const updated = await bulkAssignDriverLeads(ids, {
        userId: body.assignedManagerUserId,
        name: body.assignedManagerName ?? null,
      });
      return Response.json({ ok: true, updated, action: "assign" });
    }

    if (body.action === "transition") {
      if (!isDriverLeadStatus(body.toStatus)) {
        return Response.json({ ok: false, error: "Invalid status." }, { status: 400 });
      }
      if (body.toStatus === "rejected" && !String(body.rejectedSubstatus ?? "").trim()) {
        return Response.json(
          { ok: false, error: "Reject reason is required." },
          { status: 400 },
        );
      }
      const updated = await bulkTransitionDriverLeads(ids, body.toStatus, actor, {
        rejectedSubstatus: body.rejectedSubstatus,
      });
      return Response.json({ ok: true, updated, action: "transition" });
    }

    return Response.json({ ok: false, error: "Unknown bulk action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk action failed.";
    const status = message.includes("required") || message.includes("Invalid") ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
