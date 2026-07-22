import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  addClientNoteWithPersonalSync,
  addClientTaskToPersonalSpace,
  listClientActivity,
} from "@/lib/sales-operation/client-activity";
import { getSalesClientById } from "@/lib/sales-operation/repository";
import {
  createMeeting,
} from "@/lib/sales-operation/meetings";
import {
  createGoogleCalendarEvent,
  getCalendarTokens,
} from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const items = await listClientActivity(id);
    return Response.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load activity.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    title?: unknown;
    body?: unknown;
    description?: unknown;
    dueAt?: unknown;
    priority?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
  } | null;

  const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
  const client = await getSalesClientById(id);
  if (!client) {
    return Response.json({ ok: false, error: "Client not found." }, { status: 404 });
  }

  try {
    if (kind === "note") {
      const text = typeof body?.body === "string" ? body.body : "";
      const { note } = await addClientNoteWithPersonalSync({
        clientId: id,
        body: text,
        actor: { userId: auth.user.id, name: auth.user.name, email: auth.user.email },
      });
      return Response.json({ ok: true, kind, note });
    }

    if (kind === "task") {
      const title = typeof body?.title === "string" ? body.title : "";
      const task = await addClientTaskToPersonalSpace({
        clientId: id,
        leadId: client.leadId,
        title,
        description: typeof body?.description === "string" ? body.description : null,
        dueAt: typeof body?.dueAt === "string" ? body.dueAt : null,
        priority:
          body?.priority === "low" || body?.priority === "high" || body?.priority === "normal"
            ? body.priority
            : "normal",
        actor: { userId: auth.user.id, email: auth.user.email },
      });
      return Response.json({ ok: true, kind, task });
    }

    if (kind === "meeting") {
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const startsAt = typeof body?.startsAt === "string" ? body.startsAt : "";
      const endsAt = typeof body?.endsAt === "string" ? body.endsAt : "";
      const description = typeof body?.description === "string" ? body.description : null;

      let googleEventId: string | null = null;
      const tokens = await getCalendarTokens(auth.user.id).catch(() => null);
      if (tokens) {
        try {
          googleEventId = await createGoogleCalendarEvent(auth.user.id, {
            title,
            description,
            startsAt,
            endsAt,
          });
        } catch (error) {
          console.error("Google Calendar create failed:", error);
        }
      }

      const meeting = await createMeeting(auth.user.id, {
        title,
        description,
        startsAt,
        endsAt,
        clientId: id,
        googleEventId,
      });
      return Response.json({
        ok: true,
        kind,
        meeting,
        googleSynced: Boolean(googleEventId),
      });
    }

    return Response.json(
      { ok: false, error: "kind must be note, task, or meeting." },
      { status: 400 },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create activity." },
      { status: 500 },
    );
  }
}
