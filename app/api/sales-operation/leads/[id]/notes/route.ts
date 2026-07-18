import { isSupabaseConfigured } from "@/lib/supabase";
import { loadAuthStore } from "@/lib/auth-store";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createSalesLeadNote, listSalesLeadNotes } from "@/lib/sales-operation/repository";
import { createNotification } from "@/lib/sales-operation/notifications";
import { findMentionedUserIds } from "@/lib/sales-operation/mentions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const notes = await listSalesLeadNotes(id);
    return Response.json({ ok: true, notes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load notes." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { body?: string } | null;
  if (!body?.body?.trim()) {
    return Response.json({ ok: false, error: "body is required." }, { status: 400 });
  }

  try {
    const note = await createSalesLeadNote(id, body.body, {
      userId: auth.user.id,
      name: auth.user.name,
    });

    // Best-effort @mention notifications for tagged colleagues.
    try {
      const store = await loadAuthStore();
      const mentioned = findMentionedUserIds(
        body.body,
        store.users.map((user) => ({ id: user.id, name: user.name })),
      ).filter((userId) => userId !== auth.user.id);
      for (const userId of mentioned) {
        await createNotification({
          userId,
          type: "mention",
          title: `${auth.user.name} mentioned you in a note`,
          body: body.body.slice(0, 160),
          leadId: id,
          link: `/sales-operation/pipeline?lead=${id}`,
        });
      }
    } catch (mentionError) {
      console.error("Failed to send mention notifications:", mentionError);
    }

    return Response.json({ ok: true, note }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create note.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
