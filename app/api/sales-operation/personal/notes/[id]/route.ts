import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deletePersonalNote, updatePersonalNote } from "@/lib/sales-operation/personal-space";
import type { UpdatePersonalNoteInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdatePersonalNoteInput | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  try {
    const note = await updatePersonalNote(
      { userId: auth.user.id, email: auth.user.email },
      id,
      body,
    );
    return Response.json({ ok: true, note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update note.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    await deletePersonalNote({ userId: auth.user.id, email: auth.user.email }, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete note." },
      { status: 500 },
    );
  }
}
