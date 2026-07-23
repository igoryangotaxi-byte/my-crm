import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import {
  createTrackerTicket,
  listTrackerTickets,
  searchTrackerTickets,
} from "@/lib/sales-operation/tracker";
import {
  TRACKER_PRIORITIES,
  type TrackerBoardFilters,
  type TrackerPriority,
} from "@/lib/sales-operation/tracker-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

function splitCsv(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { projectId } = await ctx.params;
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  const filters: TrackerBoardFilters = {
    q,
    assigneeUserIds: splitCsv(url.searchParams.get("assignee")),
    creatorUserIds: splitCsv(url.searchParams.get("creator")),
    labelIds: splitCsv(url.searchParams.get("labels")),
    statusIds: splitCsv(url.searchParams.get("status")),
    priorities: splitCsv(url.searchParams.get("priority")).filter((p) =>
      (TRACKER_PRIORITIES as readonly string[]).includes(p),
    ) as TrackerPriority[],
    dueFrom: url.searchParams.get("dueFrom"),
    dueTo: url.searchParams.get("dueTo"),
    createdFrom: url.searchParams.get("createdFrom"),
    createdTo: url.searchParams.get("createdTo"),
    updatedFrom: url.searchParams.get("updatedFrom"),
    updatedTo: url.searchParams.get("updatedTo"),
    includeArchived: url.searchParams.get("includeArchived") === "1",
    limitPerStatus: Number(url.searchParams.get("limit") ?? 100) || 100,
  };

  try {
    const tickets =
      q?.trim() && !filters.assigneeUserIds?.length && !filters.labelIds?.length
        ? await searchTrackerTickets(projectId, q, filters.limitPerStatus)
        : await listTrackerTickets(projectId, filters);
    return Response.json({ ok: true, tickets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load tickets." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("createTickets", auth.user.role)) return trackerForbiddenResponse("createTickets");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { projectId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      statusId?: string;
      priority?: TrackerPriority;
      dueAt?: string | null;
      parentTicketId?: string | null;
      assignees?: Array<{ userId: string; userName?: string | null }>;
      labelIds?: string[];
    };
    if (!body.title?.trim() || !body.statusId) {
      return Response.json(
        { ok: false, error: "title and statusId are required." },
        { status: 400 },
      );
    }
    if (body.assignees?.length && !canTracker("assignTickets", auth.user.role)) {
      return trackerForbiddenResponse("assignTickets");
    }
    const ticket = await createTrackerTicket(
      projectId,
      {
        title: body.title,
        description: body.description,
        statusId: body.statusId,
        priority: body.priority,
        dueAt: body.dueAt,
        parentTicketId: body.parentTicketId,
        assigneeUserIds: body.assignees,
        labelIds: body.labelIds,
      },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, ticket }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create ticket." },
      { status: 500 },
    );
  }
}
