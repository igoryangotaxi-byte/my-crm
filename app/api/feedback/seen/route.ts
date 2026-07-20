import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { markFeedbackStatusNotified } from "@/lib/feedback/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark feedback status updates as seen by the author (clears FAB badge). */
export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  try {
    for (const id of ids.slice(0, 50)) {
      await markFeedbackStatusNotified(id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to mark feedback seen.",
      },
      { status: 500 },
    );
  }
}
