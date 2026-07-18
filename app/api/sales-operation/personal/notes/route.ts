import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createPersonalNote, listPersonalNotes } from "@/lib/sales-operation/personal-space";
import type { CreatePersonalNoteInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const notes = await listPersonalNotes({ userId: auth.user.id, email: auth.user.email });
    return Response.json({ ok: true, notes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load notes." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as CreatePersonalNoteInput | null;
  if (!body?.body?.trim()) {
    return Response.json({ ok: false, error: "body is required." }, { status: 400 });
  }

  try {
    const note = await createPersonalNote({ userId: auth.user.id, email: auth.user.email }, body);
    return Response.json({ ok: true, note }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create note." },
      { status: 500 },
    );
  }
}
