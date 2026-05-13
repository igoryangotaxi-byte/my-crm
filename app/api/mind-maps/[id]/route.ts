import { normalizeMindMapDocument } from "@/lib/mind-map-document";
import { canMutateMindMap } from "@/lib/mind-map-auth";
import type { MindMapDocument } from "@/lib/mind-map-types";
import { requireApprovedUser } from "@/lib/server-auth";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  if (!id) {
    return Response.json({ ok: false, error: "Missing id." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mind_maps")
    .select("id,title,document,updated_at,created_at,created_by")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const doc = normalizeMindMapDocument(data.document);
  if (!doc) {
    return Response.json({ ok: false, error: "Invalid document." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    map: {
      ...data,
      document: doc,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  if (!id) {
    return Response.json({ ok: false, error: "Missing id." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from("mind_maps")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return Response.json({ ok: false, error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (!canMutateMindMap(auth.user, existing.created_by)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as {
    title?: unknown;
    document?: unknown;
  } | null;

  const updates: { title?: string; document?: MindMapDocument; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  let hasPayloadChange = false;
  if (payload && typeof payload.title === "string") {
    hasPayloadChange = true;
    const t = payload.title.trim();
    updates.title = t.length > 200 ? t.slice(0, 200) : t;
  }

  if (payload && payload.document !== undefined) {
    hasPayloadChange = true;
    const doc = normalizeMindMapDocument(payload.document);
    if (!doc) {
      return Response.json({ ok: false, error: "Invalid document payload." }, { status: 400 });
    }
    updates.document = doc;
  }

  if (!hasPayloadChange) {
    return Response.json({ ok: false, error: "No changes." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mind_maps")
    .update(updates)
    .eq("id", id)
    .select("id,title,document,updated_at,created_at,created_by")
    .single();

  if (error || !data) {
    return Response.json({ ok: false, error: error?.message ?? "Update failed." }, { status: 500 });
  }

  const doc = normalizeMindMapDocument(data.document);
  return Response.json({
    ok: true,
    map: { ...data, document: doc ?? updates.document },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  if (!id) {
    return Response.json({ ok: false, error: "Missing id." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from("mind_maps")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return Response.json({ ok: false, error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (!canMutateMindMap(auth.user, existing.created_by)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const { error } = await supabase.from("mind_maps").delete().eq("id", id);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const prefix = `${id}/`;
  const { data: files } = await supabase.storage.from("mind-map-files").list(id);
  if (files?.length) {
    const paths = files.map((f) => `${id}/${f.name}`);
    await supabase.storage.from("mind-map-files").remove(paths);
  }

  return Response.json({ ok: true });
}
