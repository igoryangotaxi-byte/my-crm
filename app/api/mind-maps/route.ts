import { createEmptyMindMapDocument } from "@/lib/mind-map-document";
import { requireApprovedUser } from "@/lib/server-auth";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mind_maps")
    .select("id,title,updated_at,created_at,created_by")
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, maps: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const titleRaw = typeof payload?.title === "string" ? payload.title.trim() : "";
  const title = titleRaw.length > 200 ? titleRaw.slice(0, 200) : titleRaw || "Untitled map";

  const supabase = getSupabaseAdminClient();
  const doc = createEmptyMindMapDocument();
  const documentPayload = JSON.parse(JSON.stringify(doc)) as typeof doc;
  const { data, error } = await supabase
    .from("mind_maps")
    .insert({
      title,
      document: documentPayload,
      created_by: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("id,title,updated_at,created_at,created_by")
    .single();

  if (error || !data) {
    return Response.json({ ok: false, error: error?.message ?? "Insert failed." }, { status: 500 });
  }

  return Response.json({ ok: true, map: data });
}
