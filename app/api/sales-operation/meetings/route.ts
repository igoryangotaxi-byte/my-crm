import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  createMeeting,
  deleteMeeting,
  listMeetingsForUser,
  updateMeeting,
} from "@/lib/sales-operation/meetings";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getCalendarTokens,
  updateGoogleCalendarEvent,
} from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesOperation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim() || undefined;
  const to = url.searchParams.get("to")?.trim() || undefined;

  try {
    const meetings = await listMeetingsForUser(auth.user.id, { from, to });
    return Response.json({ ok: true, meetings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load meetings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesOperation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    clientId?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title : "";
  const startsAt = typeof body?.startsAt === "string" ? body.startsAt : "";
  const endsAt = typeof body?.endsAt === "string" ? body.endsAt : "";
  const description = typeof body?.description === "string" ? body.description : null;
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;

  try {
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
      clientId,
      googleEventId,
    });
    return Response.json({ ok: true, meeting, googleSynced: Boolean(googleEventId) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create meeting." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesOperation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    title?: unknown;
    description?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    clientId?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return Response.json({ ok: false, error: "id is required." }, { status: 400 });

  try {
    const meeting = await updateMeeting(auth.user.id, id, {
      title: typeof body?.title === "string" ? body.title : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      startsAt: typeof body?.startsAt === "string" ? body.startsAt : undefined,
      endsAt: typeof body?.endsAt === "string" ? body.endsAt : undefined,
      clientId: typeof body?.clientId === "string" ? body.clientId : undefined,
    });

    if (meeting.googleEventId) {
      try {
        await updateGoogleCalendarEvent(auth.user.id, meeting.googleEventId, {
          title: meeting.title,
          description: meeting.description,
          startsAt: meeting.startsAt,
          endsAt: meeting.endsAt,
        });
      } catch (error) {
        console.error("Google Calendar update failed:", error);
      }
    }

    return Response.json({ ok: true, meeting });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update meeting.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesOperation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() || "";
  if (!id) return Response.json({ ok: false, error: "id is required." }, { status: 400 });

  try {
    const meeting = await deleteMeeting(auth.user.id, id);
    if (meeting.googleEventId) {
      try {
        await deleteGoogleCalendarEvent(auth.user.id, meeting.googleEventId);
      } catch (error) {
        console.error("Google Calendar delete failed:", error);
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete meeting.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
