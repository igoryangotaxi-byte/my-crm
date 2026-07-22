import { requireApprovedUser } from "@/lib/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { deleteCalendarTokens, getCalendarTokens, isGoogleCalendarConfigured } from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const connected = Boolean(await getCalendarTokens(auth.user.id).catch(() => null));
  return Response.json({
    ok: true,
    configured: isGoogleCalendarConfigured(),
    connected,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    await deleteCalendarTokens(auth.user.id);
    return Response.json({ ok: true, connected: false });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to disconnect." },
      { status: 500 },
    );
  }
}
